import { spawn } from "child_process"

export default async (command: any, path: string) => {
  const [cmd, ...args] = command.split(" ")
  return new Promise((resolve, reject) => {
    const app = spawn(cmd, args, {
      cwd: path,
      stdio: "inherit",
      shell: true,
    });

    app.on("close", resolve);
  });
}
