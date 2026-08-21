export async function loadFires(url = "assets/fires.bin") {
  const buf = await (await fetch(url)).arrayBuffer();
  const head = new Uint32Array(buf, 0, 4);
  const n = head[0];
  const years = [head[1], head[2]];

  let o = 16;
  const xq = new Int16Array(buf, o, n);
  o += 2 * n;
  const yq = new Int16Array(buf, o, n);
  o += 2 * n;
  const dt = new Uint16Array(buf, o, n);
  o += 2 * n;
  o += (4 - (o % 4)) % 4;
  const ha = new Uint32Array(buf, o, n);

  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const t = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    x[i] = xq[i] / 1e4;
    y[i] = yq[i] / 1e4;
    acc += dt[i];
    t[i] = years[0] + acc / 1e3;
  }

  return { meta: { n, years }, x, y, ha, t };
}
