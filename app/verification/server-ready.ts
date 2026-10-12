export default async function serverReady() {
  const deadline = Date.now() + 10000,
    url = process.env.FB01_URL ?? "http://127.0.0.1:4175";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.text()).includes("FB01")) return;
    } catch {
      /* Wait for the static container's actual HTTP readiness. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("FB01 static image was not ready");
}
