import { IService } from './../index';

export abstract class ProtocolService<T extends string> implements IService {
  id: symbol;
  name: string;
  description: string;

  protocol: string[]

  type: T

  constructor(id: symbol, protocol: string[]) {
    this.id = id;
    this.name = id.description!;
    this.description = `${name} Protocol Service`;
    this.protocol = protocol
  }
}

export const IMAGE_SUFFIX = [
  'jpg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'jpeg', 'avif'
]

export class ImageProtocolService extends ProtocolService<'image'> {
  constructor() {
    super(Symbol('ImageProtocol'), IMAGE_SUFFIX)
  }
}

export const AUDIO_SUFFIX = [
  'mp3', 'wav', 'ogg', 'aac', 'flac', 'wma', 'ape', 'm4a', 'm4r', 'm4b', 'm4p', 'm4v', 'mp4', '3gp', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'rmvb', 'rm', 'asf', 'dat', 'mpg', 'mpeg', 'vob', 'f4v', 'm3u8', 'webm', 'ts', 'mts', 'm2ts', 'mts', 'dv', 'divx', 'xvid', 'mpe', 'mod', 'sdp', 'm2v', 'm2p', 'm2t', 'm2ts', 'm2v', 'm2p', 'm2t', 'm2ts', 'm2v', 'm2p', 'm2t', 'm2ts', 'm2v', 'm2p', 'm2t', 'm2ts', 'm2v', 'm2p', 'm2t', 'm2ts', 'm2v', 'm2p', 'm2t', 'm2ts'
]

export class AudioProtocolService extends ProtocolService<'audio'> {
  constructor() {
    super(Symbol('AudioProtocol'), AUDIO_SUFFIX)
  }
}

export const VIDEO_SUFFIX = [
  'mp4', '3gp', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'rmvb', 'rm', 'asf', 'dat', 'mpg', 'mpeg', 'vob', 'f4v', 'm3u8', 'webm', 'ts', 'mts', 'm2ts', 'mts', 'dv', 'divx', 'xvid', 'mpe', 'mod', 'sdp', 'm2v', 'm2p', 'm2t', 'm2ts', 'm2v', 'm2p', 'm2t', 'm2ts', 'm2v', 'm2p', 'm2t', 'm2ts', 'm2v', 'm2p', 'm2t', 'm2ts', 'm2v', 'm2p', 'm2t', 'm2ts'
]

export class VideoProtocolService extends ProtocolService<'video'> {
  constructor() {
    super(Symbol('VideoProtocol'), VIDEO_SUFFIX)
  }
}

export const TEXT_SUFFIX = [
  'txt', 'md', 'markdown', 'json', 'js', 'ts', 'html', 'css', 'scss', 'sass', 'less', 'xml', 'yaml', 'yml', 'ini', 'log', 'bat', 'sh', 'cmd', 'c', 'cpp', 'h', 'hpp', 'java', 'py', 'go', 'php', 'sql', 'swift', 'vb', 'vbs', 'lua', 'rb', 'r', 'cs', 'm', 'mm', 'pl', 'perl', 'asm', 'asmx', 'inc', 'coffee', 'ts', 'tsx', 'jsx', 'vue', 'php', 'php3', 'php4', 'php5', 'php7', 'phps', 'phtml', 'pht', 'phar', 'phpt', 'php-cgi', 'php-cs-fixer', 'phpunit', 'phpunit.xml', 'phpunit.xml.dist', 'phpunit.phar', 'phpunit.phar.dist', 'phpunit-4.8.36.phar', 'phpunit-4.8.36.phar.dist', 'phpunit-5.7.27.phar', 'phpunit-5.7.27.phar.dist', 'phpunit-6.5.14.phar', 'phpunit-6.5.14.phar.dist', 'phpunit-7.5.20.phar', 'phpunit-7.5.20.phar.dist', 'phpunit-8.5.8.phar', 'phpunit-8.5.8.phar.dist', 'phpunit-9.3.10.phar', 'phpunit-9.3.10.phar.dist', 'phpunit-9.4.3.phar', 'phpunit-9.4.3.phar.dist', 'phpunit-9.5.0.phar', 'phpunit-9.5.0.phar.dist', 'phpunit-9.5.1.phar', 'phpunit-9.5.1.phar.dist', 'phpunit-9.5.2.phar', 'phpunit-9.5.2.phar.dist', 'phpunit-9.5.4.phar', 'phpunit-9.5.4.phar.dist', 'php'
]

export class TextProtocolService extends ProtocolService<'text'> {
  constructor() {
    super(Symbol('TextProtocol'), TEXT_SUFFIX)
  }
}

export const serviceSuffixMap = new Map<ProtocolService<string>, string[]>

serviceSuffixMap.set(new ImageProtocolService(), IMAGE_SUFFIX)
serviceSuffixMap.set(new AudioProtocolService(), AUDIO_SUFFIX)
serviceSuffixMap.set(new VideoProtocolService(), VIDEO_SUFFIX)
serviceSuffixMap.set(new TextProtocolService(), TEXT_SUFFIX)

export function suffix2Service(suffix: string): ProtocolService<string> | null {

  for (const [type, suffixes] of serviceSuffixMap.entries()) {
    if (suffixes.includes(suffix)) {
      return type
    }
  }

  return null
}