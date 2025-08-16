// === IMPORTA A API ===
import { calcIrrigation, getDefaults } from "./api.js";

// === HELPERS DOM ===
const qs  = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// === NAVEGAÇÃO ENTRE PASSOS ===
function goToStep(n) {
  const panes = qsa(".step-pane");
  const steps = qsa(".stepper .step");
  const max = panes.length || 5;
  const step = Math.max(1, Math.min(max, n));

  panes.forEach(p => p.classList.toggle("active", Number(p.dataset.step) === step));
  steps.forEach(s => s.classList.toggle("active", Number(s.dataset.step) === step));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function stepOf(el) {
  const pane = el.closest(".step-pane");
  return pane ? Number(pane.dataset.step) : 1;
}

// === CHIPS / ABAS ===
function toggleActive(list, activeEl) {
  list.forEach(b => b.classList.toggle("active", b === activeEl));
}
function handleChip(btn) {
  if (btn.classList.contains("soil")) toggleActive(qsa(".soil.btn-chip"), btn);
  if (btn.classList.contains("sys"))  toggleActive(qsa(".sys.btn-chip"),  btn);
}
function switchTab(key) {
  qsa(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === key));
  qsa(".tab-pane").forEach(p => p.classList.toggle("active", p.dataset.tab === key));
  updateDerived();
}

// === CAMPOS DERIVADOS (área/plants automáticos) ===
function valNum(id) {
  const el = document.getElementById(id);
  return el ? num(el.value) : null;
}
function updateDerived() {
  const bedsTab = qs('.tab-pane[data-tab="canteiro"]')?.classList.contains("active");
  const len = valNum("len"), wid = valNum("wid"), beds = valNum("beds");
  const rs = valNum("rowSpacing"), ps = valNum("plantSpacing");
  const areaAuto = qs("#areaAuto"), plantsAuto = qs("#plantsAuto");

  if (!bedsTab) {
    if (areaAuto) areaAuto.value = "";
    if (plantsAuto) plantsAuto.value = "";
    return;
  }
  if (len && wid && beds) {
    const areaM2 = len * wid * beds;
    if (areaAuto) areaAuto.value = areaM2.toFixed(2);
    if (rs && ps && plantsAuto) {
      const areaPlanta = (rs/100) * (ps/100);
      if (areaPlanta > 0) plantsAuto.value = Math.floor(areaM2 / areaPlanta);
    }
  } else {
    if (areaAuto) areaAuto.value = "";
    if (plantsAuto) plantsAuto.value = "";
  }
}

// === COLETA DE DADOS ===
function selectedSoil() {
  return qs(".soil.btn-chip.active")?.dataset?.soil || "franco";
}
function selectedEff() {
  return Number(qs(".sys.btn-chip.active")?.dataset?.eff || "0.90");
}
function selectedClimate() {
  return qs('input[name="clima"]:checked')?.value || "ameno";
}
function areaPayload() {
  const isHa = qs('.tab.active[data-tab="ha"]');
  return isHa
    ? { mode: "ha", ha: valNum("areaHa") }
    : { mode: "beds", len: valNum("len"), wid: valNum("wid"), beds: valNum("beds") };
}
function spacingPayload() {
  return { rowSpacing: valNum("rowSpacing"), plantSpacing: valNum("plantSpacing") };
}
function gatherPayload() {
  const crop = qs("#crop")?.value || "tomate";
  const soilType = selectedSoil();
  const kc = valNum("kc"), rootDepth = valNum("rootDepth"), cad = valNum("cad");
  const area = areaPayload();
  const plants = valNum("plants");
  const climate = selectedClimate();
  const month = Number(qs("#mes")?.value || "8");
  const eto = valNum("eto");
  const systemEff = selectedEff();
  const emit = valNum("emit");
  const emitCount = valNum("emitCount") || 1;

  return { crop, soilType, kc, rootDepth, cad, area, plants, spacing: spacingPayload(),
           climate, month, eto, systemEff, emit, emitCount };
}

// === FORMATAÇÃO ===
const fmtL   = x => `${(x).toLocaleString(undefined,{maximumFractionDigits:1})} L`;
const fmtMm  = x => `${(x).toFixed(1)} mm`;
const fmtMin = x => `${Math.round(x)} min`;
function fmtDays(x){ const d = Math.round(x); return d <= 1 ? "Todos os dias" : `A cada ${d} dias`; }

// === CÁLCULO / PREENCHIMENTO ===
async function runCalc() {
  const payload = gatherPayload();

  if (payload.kc == null || payload.rootDepth == null || payload.cad == null) {
    const defs = await getDefaults({ crop: payload.crop, soil: payload.soilType });
    if (payload.kc == null)        payload.kc = defs.kc;
    if (payload.rootDepth == null) payload.rootDepth = defs.rootDepth;
    if (payload.cad == null)       payload.cad = defs.cad;
  }

  const data = await calcIrrigation(payload);
  const { metrics, daily, schedule } = data;

  qs("#outEtc").textContent = fmtMm(metrics.etc);
  qs("#outNIR").textContent = fmtMm(metrics.nir);
  qs("#outGIR").textContent = fmtMm(metrics.gir);

  qs("#outDailyVol").textContent   = daily.totalLiters != null ? `${fmtL(daily.totalLiters)}/dia` : "—";
  qs("#outPerPlant").textContent   = daily.perPlantLiters != null ? `${fmtL(daily.perPlantLiters)}/dia` : "—";
  qs("#outInterval").textContent   = fmtDays(schedule.intervalDays);
  qs("#outEventVol").textContent   = schedule.eventTotalLiters != null ? `${fmtL(schedule.eventTotalLiters)} por evento` : "—";
  qs("#outMinutes").textContent    = schedule.minutesPerEventPerPlant != null ? `${fmtMin(schedule.minutesPerEventPerPlant)} por planta` : "—";

  goToStep(5);
}

// === BIND DOS EVENTOS (sem delegação, explícito e robusto) ===
function bindEvents() {
  // Próximo / Voltar
  qsa(".step-pane .next").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      goToStep(stepOf(btn) + 1);
    });
  });
  qsa(".step-pane .back").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      goToStep(stepOf(btn) - 1);
    });
  });

  // Chips solo/sistema
  qsa(".soil.btn-chip, .sys.btn-chip").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      handleChip(btn);
    });
  });

  // Abas área
  qsa(".tab").forEach(tab => {
    tab.addEventListener("click", e => {
      e.preventDefault();
      switchTab(tab.dataset.tab);
    });
  });

  // Botões principais
  qs("#btnCalc")?.addEventListener("click", e => {
    e.preventDefault();
    runCalc().catch(err => {
      console.error(err);
      alert("Erro ao calcular. Verifique os dados.");
    });
  });
  qs("#btnNovo")?.addEventListener("click", e => {
    e.preventDefault();
    goToStep(1);
  });

  // Campos derivados
  ["len","wid","beds","rowSpacing","plantSpacing"].forEach(id => {
    qs(`#${id}`)?.addEventListener("input", updateDerived);
  });
}

// === INIT ===
document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  updateDerived();
  // console.log("app.js carregado"); // útil pra diagnosticar
});
