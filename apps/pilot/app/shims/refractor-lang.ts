type RefractorLike = {
  register?: (language: unknown) => void
}

export default function refractorLanguageShim(refractor?: RefractorLike) {
  return refractor
}
