import { spawnSafe } from "../../../../utils/common/utils/safe-shell"

export default async (command: any, path: string) => {
  const [cmd, ...args] = String(command ?? '').trim().split(" ")
  return new Promise((resolve, _reject) => {
    const app = spawnSafe(cmd, args, {
      cwd: path,
      stdio: "inherit",
    });

    app.on("close", resolve);
  });
}
