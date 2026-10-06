import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { isVersionOnlyArgv, VERSION } from "../src/cli.js";

const execFileAsync = promisify(execFile);
const BIN = fileURLToPath(new URL("../bin/lavish-axi.js", import.meta.url));

// Accepts the telemetry connection and never answers, so a regression pays the whole
// drain timeout instead of a fast connection refusal.
async function startBlackHoleTelemetry() {
  const sockets = new Set();
  const requests = [];
  const server = createServer((req) => {
    requests.push(req.url);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(undefined));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    requests,
    host: `http://127.0.0.1:${port}`,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test("isVersionOnlyArgv matches exactly the SDK's version-flag shapes", () => {
  for (const flag of ["--version", "-v", "-V"]) {
    assert.equal(isVersionOnlyArgv([flag]), true);
  }
  for (const argv of [[], ["--help"], ["open"], ["--version", "extra"], ["open", "--version"]]) {
    assert.equal(isVersionOnlyArgv(argv), false);
  }
});

test("--version prints the version without initializing state", async (t) => {
  const stateParent = await mkdtemp(`${tmpdir()}/lavish-axi-version-`);
  const stateDir = `${stateParent}/state`;
  t.after(() => rm(stateParent, { recursive: true, force: true }));

  for (const flag of ["--version", "-v", "-V"]) {
    const { stdout } = await execFileAsync(process.execPath, [BIN, flag], { env });

    assert.equal(stdout, `${VERSION}\n`);
  }
});
