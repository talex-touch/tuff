import { exec, ExecException } from 'child_process';

export interface IGlobalPkgResult {
  exist: boolean
  error?: ExecException
  name: string
  version: string
}

export function checkGlobalPackageExist(packageName: string) {
  return new Promise((resolve, reject) => {
    exec(`npm list -g ${packageName}`, (error, stdout, stderr) => {
      if (error) {
        reject({
          exits: false,
          error: error
        });
        return;
      }
      if (stderr) {
        reject({
          exits: false,
          error: stderr
        });
        return;
      }

      const lines = stdout.split('\n');
      const lastLine = lines[lines.length - 2];
      const match = lastLine.match(/(\S+)@(\S+)/);
      if (match) {
        resolve({
          exist: true,
          name: match[1],
          version: match[2]
        } as IGlobalPkgResult);
        return;
      }

      resolve({
        exist: false
      })

    });
  })
}