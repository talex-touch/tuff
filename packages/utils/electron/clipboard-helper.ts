import { clipboard } from 'electron'

/**
 * Represents a file object from the clipboard
 */
interface ClipboardFileInfo {
  /** File data as a buffer */
  buffer: Buffer
  /** MIME type of the file */
  mimetype: string
  /** Original filename */
  originalname: string
}

/**
 * Possible return types from clipboard file operations
 */
export type ClipboardFileResult = string | ClipboardFileInfo

/**
 * Utility class for handling clipboard file operations across different platforms
 */
export class ClipboardHelper {
  /**
   * Check if the current platform is macOS
   * @private
   */
  private get isMac(): boolean {
    return process.platform === 'darwin'
  }

  /**
   * Generate a unique identifier with specified length and radix
   * @param length - Length of the generated string
   * @param radix - Radix for number conversion (default: 16)
   * @returns Generated unique identifier
   * @private
   */
  private generateUuid(length: number, radix: number = 16): string {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')
    const uuid: string[] = []
    let i: number

    radix = radix || chars.length

    if (length) {
      for (i = 0; i < length; i++) {
        uuid[i] = chars[0 | (Math.random() * radix)]
      }
    } else {
      let r: number
      uuid[8] = uuid[13] = uuid[18] = uuid[23] = '-'
      uuid[14] = '4'

      for (i = 0; i < 36; i++) {
        if (!uuid[i]) {
          r = 0 | (Math.random() * 16)
          uuid[i] = chars[i === 19 ? (r & 0x3) | 0x8 : r]
        }
      }
    }

    return uuid.join('')
  }

  /**
   * Process clipboard files on macOS platform
   * @returns Array of file paths or file info objects
   * @private
   */
  private getClipboardFilesMac(): ClipboardFileResult[] {
    let filePath: ClipboardFileResult[] = []

    if (clipboard.has('NSFilenamesPboardType')) {
      // Handle multiple files
      const tagContent = clipboard.read('NSFilenamesPboardType').match(/<string>.*<\/string>/g)
      filePath = tagContent ? tagContent.map(item => item.replace(/<string>|<\/string>/g, '')) : []
    } else {
      // Handle single file
      const clipboardImage = clipboard.readImage('clipboard')
      if (!clipboardImage.isEmpty()) {
        // Handle image from clipboard
        const png = clipboardImage.toPNG()
        const fileInfo: ClipboardFileInfo = {
          buffer: png,
          mimetype: 'image/png',
          originalname: this.generateUuid(8, 16) + '.png'
        }
        filePath = [fileInfo]
      } else {
        // Handle single file path
        const fileUrl = clipboard.read('public.file-url')
        if (fileUrl) {
          filePath = [fileUrl.replace('file://', '')].filter(item => item)
        }
      }
    }

    return filePath
  }

  /**
   * Process clipboard files on Windows platform
   * @returns Array of file paths or file info objects
   * @private
   */
  private getClipboardFilesWindows(): ClipboardFileResult[] {
    let filePath: ClipboardFileResult[] = []

    if (clipboard.has('CF_HDROP')) {
      // Handle multiple files
      const rawFilePathStr = clipboard.readBuffer('CF_HDROP').toString('ucs2') || ''
      let formatFilePathStr = [...rawFilePathStr]
        .filter((_, index) => rawFilePathStr.charCodeAt(index) !== 0)
        .join('')
        .replace(/\\/g, '\\\\')

      const drivePrefix = formatFilePathStr.match(/[a-zA-Z]:\\/)

      if (drivePrefix) {
        const drivePrefixIndex = formatFilePathStr.indexOf(drivePrefix[0])
        if (drivePrefixIndex !== 0) {
          formatFilePathStr = formatFilePathStr.substring(drivePrefixIndex)
        }
        filePath = formatFilePathStr
          .split(drivePrefix[0])
          .filter(item => item)
          .map(item => drivePrefix[0] + item)
      }
    } else {
      // Handle single file
      const clipboardImage = clipboard.readImage('clipboard')
      if (!clipboardImage.isEmpty()) {
        // Handle image from clipboard
        const png = clipboardImage.toPNG()
        const fileInfo: ClipboardFileInfo = {
          buffer: png,
          mimetype: 'image/png',
          originalname: this.generateUuid(8, 16) + '.png'
        }
        filePath = [fileInfo]
      } else {
        // Handle single file path
        try {
          const fileName = clipboard.readBuffer('FileNameW').toString('ucs2').replace(RegExp(String.fromCharCode(0), 'g'), '')
          if (fileName) {
            filePath = [fileName]
          }
        } catch (error) {
          // Ignore read errors for non-file clipboard content
        }
      }
    }

    return filePath
  }

  /**
   * Retrieves file paths or file information from the system clipboard
   *
   * This method handles both file paths and images from the clipboard across different platforms.
   * On macOS, it uses NSFilenamesPboardType for multiple files and public.file-url for single files.
   * On Windows, it uses CF_HDROP for multiple files and FileNameW for single files.
   *
   * @returns Array of file paths (strings) or file info objects containing buffer data for images
   * @throws {Error} When clipboard access fails or platform is unsupported
   *
   * @example
   * ```typescript
   * const clipboardHelper = new ClipboardHelper()
   * const files = clipboardHelper.getClipboardFiles()
   *
   * files.forEach(file => {
   *   if (typeof file === 'string') {
   *     console.log('File path:', file)
   *   } else {
   *     console.log('Image file:', file.originalname, 'Size:', file.buffer.length)
   *   }
   * })
   * ```
   */
  public getClipboardFiles(): ClipboardFileResult[] {
    try {
      if (this.isMac) {
        return this.getClipboardFilesMac()
      } else {
        return this.getClipboardFilesWindows()
      }
    } catch (error) {
      console.error('Failed to read clipboard files:', error)
      return []
    }
  }
}

/**
 * Default export of ClipboardHelper class for convenience
 */
export default ClipboardHelper
