// Layered DAG layout (no graph library): longest-path layering, then barycentre passes that pull each node
// towards its neighbours in the adjacent layer while keeping a minimum vertical gap.

export const NODE_W = 188;
export const NODE_H = 56;
const COL_GAP = 84; // horizontal space between columns
const ROW_GAP = 18; // vertical space between nodes in one column
const PAD = 28;

function place(layer, desired) {
  // Sort by desired position, enforce the minimum gap, then shift the column so its centre matches the desired centre
  const order = [...layer].sort((a, b) => desired.get(a) - desired.get(b));
  const step = NODE_H + ROW_GAP;
  const placed = [];
  order.forEach((id, i) => {
    const want = desired.get(id);
    placed.push(i === 0 ? want : Math.max(want, placed[i - 1] + step));
  });
  const shift = order.reduce((s, id, i) => s + desired.get(id) - placed[i], 0) / (order.length || 1);
  const out = new Map();
  order.forEach((id, i) => out.set(id, placed[i] + shift));
  return { order, ys: out };
}

export function computeLayout(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parents = new Map(nodes.map((n) => [n.id, n.parents.filter((p) => byId.has(p))]));
  const children = new Map(nodes.map((n) => [n.id, []]));
  for (const n of nodes) for (const p of parents.get(n.id)) children.get(p).push(n.id);

  // Longest path from a root decides the column
  const depth = new Map();
  const visit = (id, stack = new Set()) => {
    if (depth.has(id)) return depth.get(id);
    if (stack.has(id)) return 0; // defensive: ignore a cycle edge
    stack.add(id);
    const ps = parents.get(id);
    const d = ps.length ? Math.max(...ps.map((p) => visit(p, stack) + 1)) : 0;
    stack.delete(id);
    depth.set(id, d);
    return d;
  };
  nodes.forEach((n) => visit(n.id));

  const layers = [];
  nodes.forEach((n) => {
    const d = depth.get(n.id);
    (layers[d] ||= []).push(n.id);
  });

  const step = NODE_H + ROW_GAP;
  const y = new Map();
  layers[0]?.forEach((id, i) => y.set(id, i * step));
  const avg = (ids) => ids.reduce((s, id) => s + y.get(id), 0) / ids.length;

  const forward = () => {
    for (let d = 1; d < layers.length; d++) {
      const desired = new Map(layers[d].map((id, i) => {
        const ps = parents.get(id);
        return [id, ps.length ? avg(ps) : (y.get(id) ?? i * step)];
      }));
      const { order, ys } = place(layers[d], desired);
      layers[d] = order;
      ys.forEach((v, id) => y.set(id, v));
    }
  };
  const backward = () => {
    for (let d = layers.length - 2; d >= 0; d--) {
      const desired = new Map(layers[d].map((id) => {
        const cs = children.get(id);
        return [id, cs.length ? (avg(cs) + y.get(id)) / 2 : y.get(id)];
      }));
      const { order, ys } = place(layers[d], desired);
      layers[d] = order;
      ys.forEach((v, id) => y.set(id, v));
    }
  };
  forward();
  backward();
  forward();
  backward();
  forward();

  const minY = Math.min(...nodes.map((n) => y.get(n.id)));
  const positions = new Map();
  nodes.forEach((n) => positions.set(n.id, {
    x: PAD + depth.get(n.id) * (NODE_W + COL_GAP),
    y: PAD + y.get(n.id) - minY,
  }));
  const maxY = Math.max(...[...positions.values()].map((p) => p.y));
  const edges = nodes.flatMap((n) => parents.get(n.id).map((p) => ({ from: p, to: n.id })));
  return {
    positions,
    edges,
    children,
    width: PAD * 2 + layers.length * NODE_W + (layers.length - 1) * COL_GAP,
    height: maxY + NODE_H + PAD,
  };
}

/** Cubic edge from the right side of `a` to the left side of `b`. */
export function edgePath(a, b) {
  const x1 = a.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const x2 = b.x;
  const y2 = b.y + NODE_H / 2;
  const mid = (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`;
}
