import Foundation
import NaturalLanguage
import Translation

struct Request: Decodable {
    let id: String
    let operation: String
    let text: String?
    let sourceLang: String?
    let targetLang: String?
}

struct Response: Encodable {
    let id: String
    var supported: Bool?
    var ready: Bool?
    var installedLanguages: [String]?
    var reason: String?
    var text: String?
    var sourceLang: String?
    var targetLang: String?
    var durationMs: Double?
    var code: String?
    var message: String?
}

struct HelperError: Error {
    let code: String
    let message: String
}

@available(macOS 26.0, *)
final class Translator {
    private let availability = LanguageAvailability()
    private var sessions: [String: TranslationSession] = [:]
    private var sessionOrder: [String] = []
    private var detectionHints: [NLLanguage: Double] = [:]
    private var hasProbedStatus = false

    private func language(_ identifier: String) -> Locale.Language {
        let normalized = identifier.replacingOccurrences(of: "_", with: "-")
        switch normalized.lowercased() {
        case "zh", "zh-cn", "zh-sg": return Locale.Language(identifier: "zh-Hans")
        case "zh-tw", "zh-hk": return Locale.Language(identifier: "zh-Hant")
        default: return Locale.Language(identifier: normalized)
        }
    }

    private func session(from source: Locale.Language, to target: Locale.Language) -> TranslationSession {
        let key = "\(source.maximalIdentifier)>\(target.maximalIdentifier)"
        if let cached = sessions[key] { return cached }
        if sessionOrder.count == 8 {
            sessions.removeValue(forKey: sessionOrder.removeFirst())
        }
        let created = TranslationSession(installedSource: source, target: target)
        sessions[key] = created
        sessionOrder.append(key)
        return created
    }

    func status(id: String) async -> Response {
        let languages = await availability.supportedLanguages
        let english = Locale.Language(identifier: "en-US")
        var installed: [String] = []
        for candidate in languages {
            if candidate.languageCode?.identifier == "en" { continue }
            let forward = session(from: english, to: candidate)
            let reverse = session(from: candidate, to: english)
            if await forward.isReady, await reverse.isReady {
                installed.append(candidate.maximalIdentifier)
            }
        }
        if !installed.isEmpty { installed.append(english.maximalIdentifier) }
        let hasSimplified = installed.contains { $0.hasPrefix("zh-Hans") }
        let hasTraditional = installed.contains { $0.hasPrefix("zh-Hant") }
        if hasSimplified != hasTraditional {
            detectionHints = [hasSimplified ? .simplifiedChinese : .traditionalChinese: 1.0]
        } else {
            detectionHints = [:]
        }
        hasProbedStatus = true
        return Response(id: id, supported: true, ready: !installed.isEmpty,
                        installedLanguages: installed.sorted(),
                        reason: installed.isEmpty ? "SYSTEM_TRANSLATION_NOT_INSTALLED" : nil)
    }

    func translate(_ request: Request) async throws -> Response {
        let started = ContinuousClock.now
        guard let text = request.text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw HelperError(code: "SYSTEM_TRANSLATION_EMPTY_TEXT", message: "No text to translate")
        }
        guard let targetIdentifier = request.targetLang, !targetIdentifier.isEmpty else {
            throw HelperError(code: "SYSTEM_TRANSLATION_UNSUPPORTED_LANGUAGE", message: "Target language is required")
        }
        let sourceIdentifier: String
        if let explicit = request.sourceLang, !explicit.isEmpty, explicit != "auto" {
            sourceIdentifier = explicit
        } else {
            if !hasProbedStatus { _ = await status(id: request.id) }
            let recognizer = NLLanguageRecognizer()
            recognizer.languageHints = detectionHints
            recognizer.processString(text)
            guard let detected = recognizer.dominantLanguage else {
                throw HelperError(code: "SYSTEM_TRANSLATION_UNABLE_TO_IDENTIFY_LANGUAGE", message: "Unable to identify source language")
            }
            sourceIdentifier = detected.rawValue
        }
        let source = language(sourceIdentifier)
        let target = language(targetIdentifier)
        let supported = await availability.supportedLanguages
        func isSupported(_ candidate: Locale.Language) -> Bool {
            supported.contains { known in
                known.languageCode == candidate.languageCode &&
                    (candidate.languageCode?.identifier != "zh" || known.script == candidate.script)
            }
        }
        guard isSupported(source), isSupported(target) else {
            throw HelperError(code: "SYSTEM_TRANSLATION_UNSUPPORTED_LANGUAGE", message: "Language is not supported by Apple Translation")
        }
        if source.languageCode == target.languageCode && source.script == target.script {
            return Response(id: request.id, text: text, sourceLang: source.maximalIdentifier,
                            targetLang: target.maximalIdentifier, durationMs: elapsed(started))
        }
        let activeSession = session(from: source, to: target)
        guard await activeSession.isReady else {
            let status = await availability.status(from: source, to: target)
            throw HelperError(code: status == .unsupported ? "SYSTEM_TRANSLATION_UNSUPPORTED_LANGUAGE" : "SYSTEM_TRANSLATION_NOT_INSTALLED",
                              message: status == .unsupported ? "Language pair is unsupported" : "Install translation languages in System Settings > General > Language & Region")
        }
        let result = try await activeSession.translate(text)
        return Response(id: request.id, text: result.targetText,
                        sourceLang: result.sourceLanguage.maximalIdentifier,
                        targetLang: result.targetLanguage.maximalIdentifier, durationMs: elapsed(started))
    }

    private func elapsed(_ started: ContinuousClock.Instant) -> Double {
        let components = started.duration(to: .now).components
        return Double(components.seconds) * 1000 + Double(components.attoseconds) / 1e15
    }
}

@main
struct TranslationHelper {
    static func main() async {
        guard #available(macOS 26.0, *) else { return }
        let translator = Translator()
        let decoder = JSONDecoder()
        let encoder = JSONEncoder()
        while let line = readLine() {
            guard let data = line.data(using: .utf8), let request = try? decoder.decode(Request.self, from: data) else {
                continue
            }
            let response: Response
            do {
                switch request.operation {
                case "status": response = await translator.status(id: request.id)
                case "translate": response = try await translator.translate(request)
                default: throw HelperError(code: "SYSTEM_TRANSLATION_INVALID_RESPONSE", message: "Unknown helper operation")
                }
            } catch let error as HelperError {
                response = Response(id: request.id, code: error.code, message: error.message)
            } catch TranslationError.notInstalled {
                response = Response(id: request.id, code: "SYSTEM_TRANSLATION_NOT_INSTALLED", message: "Translation languages are not installed")
            } catch TranslationError.unsupportedSourceLanguage, TranslationError.unsupportedTargetLanguage, TranslationError.unsupportedLanguagePairing {
                response = Response(id: request.id, code: "SYSTEM_TRANSLATION_UNSUPPORTED_LANGUAGE", message: "Language pair is unsupported")
            } catch TranslationError.unableToIdentifyLanguage {
                response = Response(id: request.id, code: "SYSTEM_TRANSLATION_UNABLE_TO_IDENTIFY_LANGUAGE", message: "Unable to identify source language")
            } catch TranslationError.nothingToTranslate {
                response = Response(id: request.id, code: "SYSTEM_TRANSLATION_EMPTY_TEXT", message: "No text to translate")
            } catch {
                response = Response(id: request.id, code: "SYSTEM_TRANSLATION_UNAVAILABLE", message: "Apple Translation failed")
            }
            if var output = try? encoder.encode(response) {
                output.append(0x0a)
                FileHandle.standardOutput.write(output)
            }
        }
    }
}
