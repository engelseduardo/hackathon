// public/javascript/api.js
export const API_BASE = "http://localhost:3000/api";

export async function calcIrrigation(payload) {
  const res = await fetch(`${API_BASE}/irrigation/calc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getDefaults({ crop, soil }) {
  const q = new URLSearchParams({ crop, soil });
  const res = await fetch(`${API_BASE}/irrigation/defaults?${q.toString()}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// (opcional) também exporta tudo como default, se quiser importar de outra forma
export default { calcIrrigation, getDefaults };
