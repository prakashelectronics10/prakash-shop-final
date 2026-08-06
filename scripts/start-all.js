const { spawn } = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function run(name, args, cwd, env = {}) {
  const child = spawn(npmCmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`${name} stopped with ${signal}`);
      process.exit(1);
    }
    if (code !== 0) {
      console.log(`${name} exited with code ${code}`);
      process.exit(code);
    }
  });

  return child;
}

const api = run("api", ["run", "dev"], path.join(rootDir, "server"));
const client = run("client", ["run", "client"], rootDir, { BROWSER: "none" });

function shutdown() {
  api.kill();
  client.kill();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
