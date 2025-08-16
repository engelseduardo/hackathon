// Tabela simples de defaults (ajuste depois se quiser)
const KC_DEFAULT = {
  alface: 0.95,
  tomate: 1.15,
  milho: 1.10,
  soja: 1.05,
  feijao: 1.05,
  outro: 1.00
};

const ROOT_DEPTH_DEFAULT = { // metros
  alface: 0.30,
  tomate: 0.50,
  milho: 1.50,
  soja: 1.20,
  feijao: 0.60,
  outro: 0.50
};

// CAD padrão por tipo de solo (mm/m)
const CAD_DEFAULT = { arenoso: 60, franco: 120, argiloso: 180 };

// fração de depleção permitida (p) por tipo de solo (simples)
const P_DEFAULT = { arenoso: 0.4, franco: 0.5, argiloso: 0.6 };

// Estimativa simplificada de ETo (mm/dia) por clima e mês (1..12)
const ETO_TABLE = {
  frio:     [2.7,2.3,2.0,1.8,1.7,1.7,1.8,2.0,2.4,2.6,2.7,2.7],
  ameno:    [3.5,3.3,3.0,2.8,2.6,2.6,2.8,3.0,3.3,3.6,3.7,3.7],
  quenteU:  [4.5,4.3,4.0,3.8,3.6,3.6,3.8,4.0,4.3,4.6,4.7,4.7],
  quenteS:  [5.5,5.3,5.0,4.7,4.5,4.4,4.5,4.8,5.0,5.4,5.6,5.6]
};

function num(v, fallback = null) {
  const n = typeof v === "string" ? v.trim() : v;
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function getAreaM2(input) {
  // input.area: { mode: 'ha' | 'beds', ha, len, wid, beds }
  if (input?.area?.mode === "ha") {
    const ha = num(input.area.ha, 0);
    return ha * 10000; // 1 ha = 10.000 m²
  }
  if (input?.area?.mode === "beds") {
    const len = num(input.area.len, 0); // m
    const wid = num(input.area.wid, 0); // m
    const beds = num(input.area.beds, 0);
    return len * wid * beds;
  }
  return 0;
}

function getPlants(input, areaM2) {
  // prioridade: valor informado -> cálculo por espaçamento -> null
  const plantsDirect = num(input?.plants, null);
  if (Number.isFinite(plantsDirect) && plantsDirect > 0) return Math.floor(plantsDirect);

  const rs = num(input?.spacing?.rowSpacing, null);   // cm
  const ps = num(input?.spacing?.plantSpacing, null); // cm
  if (rs && ps) {
    const areaPerPlant = (rs / 100) * (ps / 100); // m² por planta
    if (areaPerPlant > 0) return Math.floor(areaM2 / areaPerPlant);
  }
  return null;
}

function getETo(input) {
  const etoIn = num(input?.eto, null);
  if (etoIn && etoIn > 0) return etoIn;

  const clima = input?.climate || "ameno";
  const mes = Math.min(Math.max(num(input?.month, 8), 1), 12); // default agosto
  const arr = ETO_TABLE[clima] || ETO_TABLE.ameno;
  return arr[mes - 1];
}

const IrrigationController = {
  defaults(req, res) {
    const crop = (req.query.crop || "tomate").toLowerCase();
    const soil = (req.query.soil || "franco").toLowerCase();
    return res.json({
      kc: KC_DEFAULT[crop] ?? KC_DEFAULT.outro,
      rootDepth: ROOT_DEPTH_DEFAULT[crop] ?? ROOT_DEPTH_DEFAULT.outro,
      cad: CAD_DEFAULT[soil] ?? CAD_DEFAULT.franco
    });
  },

  calc(req, res) {
    try {
      const input = req.body || {};
      const crop = (input.crop || "tomate").toLowerCase();
      const soil = (input.soilType || "franco").toLowerCase();

      const kc = num(input.kc, KC_DEFAULT[crop] ?? KC_DEFAULT.outro);
      const rootDepth = num(input.rootDepth, ROOT_DEPTH_DEFAULT[crop] ?? ROOT_DEPTH_DEFAULT.outro); // m
      const cad = num(input.cad, CAD_DEFAULT[soil] ?? CAD_DEFAULT.franco); // mm/m
      const p = P_DEFAULT[soil] ?? P_DEFAULT.franco;

      const areaM2 = getAreaM2(input);
      const eto = getETo(input);

      // Cálculos principais
      const etc = eto * kc;                 // mm/dia
      const taw = cad * rootDepth;          // mm na zona radicular
      const raw = p * taw;                  // mm úteis até irrigar
      const nir = etc;                      // sem considerar chuva/ET adicional
      const eff = num(input.systemEff, 0.9);// eficiência (0..1)
      const gir = eff > 0 ? nir / eff : nir;// mm/dia

      // Volumes (1 mm = 1 L/m²)
      const dailyTotalLiters = gir * areaM2; // L/dia

      const plants = getPlants(input, areaM2);
      const perPlantDailyLiters = plants ? (dailyTotalLiters / plants) : null;

      // Intervalo e evento
      const intervalDays = etc > 0 ? Math.max(1, raw / etc) : 1; // arredondaremos depois
      const eventMM = gir * intervalDays;           // mm por evento
      const eventTotalLiters = eventMM * areaM2;    // L por evento
      const perPlantEventLiters = plants ? (eventTotalLiters / plants) : null;

      // Tempo por evento (vazão por planta)
      const emitLh = num(input.emit, null);               // L/h por gotejador
      const emitCount = num(input.emitCount, 1);
      const flowPerPlantLh = emitLh && emitCount ? emitLh * emitCount : null;

      const minutesPerEventPerPlant = (flowPerPlantLh && perPlantEventLiters != null)
        ? (perPlantEventLiters / flowPerPlantLh) * 60
        : null;

      // Saída com números brutos (front formata)
      return res.json({
        echo: { crop, soil, kc, rootDepth, cad, p, eto, eff, areaM2, plants },
        metrics: {
          etc, nir, gir, taw, raw
        },
        daily: {
          totalLiters: dailyTotalLiters,
          perPlantLiters: perPlantDailyLiters
        },
        schedule: {
          intervalDays,
          eventMM,
          eventTotalLiters,
          perPlantEventLiters,
          flowPerPlantLh,
          minutesPerEventPerPlant
        }
      });
    } catch (err) {
      console.error(err);
      return res.status(400).json({ error: "Erro ao calcular." });
    }
  }
};

export default IrrigationController;
