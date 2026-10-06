const SUPABASE_URL = "https://bsexcmidxfbsxppahhko.supabase.co";
const SUPABASE_KEY = "sb_publishable_t5JAOoCSrEQWFYA57Er6tg_t8r5DCVl";
const TABLE_URL = `${SUPABASE_URL}/rest/v1/participants`;
const GEO_URL = "https://cdn.jsdelivr.net/gh/datasets/geo-countries@main/data/countries.geojson";

const positions = [
  "Руководство и менеджмент",
  "HR и управление персоналом",
  "Обучение и развитие",
  "Административные и экспертные позиции",
  "Продажи и клиентский сервис",
  "Другое"
];

const countrySelect = document.getElementById("country");
const form = document.getElementById("participant-form");
const submitButton = form.querySelector(".primary");
const map = L.map("map", { worldCopyJump: true, minZoom: 2, maxZoom: 6 }).setView([20, 10], 2);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 6,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let geoLayer;
let countries = [];
let participants = [];

const headers = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json"
};

async function loadParticipants() {
  const response = await fetch(`${TABLE_URL}?select=id,country,gender,position,created_at&order=created_at.desc`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!response.ok) {
    throw new Error(`Supabase GET error: ${response.status}`);
  }
  participants = await response.json();
}

async function addParticipant(participant) {
  const response = await fetch(TABLE_URL, {
    method: "POST",
    headers: {
      ...headers,
      "Prefer": "return=representation"
    },
    body: JSON.stringify(participant)
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase POST error: ${response.status} ${message}`);
  }
  const created = await response.json();
  participants = [...created, ...participants];
}

function countryName(feature) {
  return feature?.properties?.ADMIN || feature?.properties?.name || feature?.properties?.NAME || "Неизвестная страна";
}

function countsByCountry(data) {
  return data.reduce((acc, x) => {
    acc[x.country] = (acc[x.country] || 0) + 1;
    return acc;
  }, {});
}

function colorFor(n) {
  if (!n) return "#e9edf3";
  if (n === 1) return "#cdd8ff";
  if (n <= 3) return "#a9baff";
  if (n <= 7) return "#7f98ff";
  if (n <= 15) return "#5d79f6";
  return "#315efb";
}

function renderMap() {
  const counts = countsByCountry(participants);
  if (geoLayer) geoLayer.remove();

  geoLayer = L.geoJSON(countries, {
    style: f => ({
      color: "#ffffff",
      weight: 1,
      fillColor: colorFor(counts[countryName(f)] || 0),
      fillOpacity: .88
    }),
    onEachFeature: (feature, layer) => {
      const name = countryName(feature);
      const n = counts[name] || 0;
      layer.bindPopup(`<div class="country-popup"><h4>${name}</h4><p>Участников: <strong>${n}</strong></p></div>`);
      layer.on({
        mouseover: e => e.target.setStyle({ weight: 2, color: "#315efb" }),
        mouseout: e => geoLayer.resetStyle(e.target)
      });
    }
  }).addTo(map);
}

function renderStats() {
  const data = participants;
  document.getElementById("total").textContent = data.length;
  document.getElementById("male").textContent = data.filter(x => x.gender === "male").length;
  document.getElementById("female").textContent = data.filter(x => x.gender === "female").length;

  const countryCounts = Object.entries(countsByCountry(data)).sort((a,b) => b[1]-a[1]);
  const top = document.getElementById("top-countries");
  top.innerHTML = countryCounts.length ? countryCounts.slice(0, 7).map(([name,n]) => {
    const max = countryCounts[0][1] || 1;
    return `<div class="rank-row"><span class="rank-label">${name}</span><span class="rank-value">${n}</span><div class="rank-bar"><span style="width:${n/max*100}%"></span></div></div>`;
  }).join("") : `<div class="muted">Пока нет участников</div>`;

  const posCounts = positions.map(p => [p, data.filter(x => x.position === p).length]);
  const maxPos = Math.max(1, ...posCounts.map(x => x[1]));
  document.getElementById("positions").innerHTML = posCounts.map(([name,n]) =>
    `<div class="rank-row"><span class="rank-label">${name}</span><span class="rank-value">${n}</span><div class="rank-bar"><span style="width:${n/maxPos*100}%"></span></div></div>`
  ).join("");
}

function fillCountrySelect(features) {
  const names = [...new Set(features.map(countryName))].filter(Boolean).sort((a,b) => a.localeCompare(b, "ru"));
  countrySelect.innerHTML = `<option value="">Выберите страну</option>` +
    names.map(n => `<option value="${n.replaceAll('"','&quot;')}">${n}</option>`).join("");
}

form.addEventListener("submit", async e => {
  e.preventDefault();

  const gender = document.querySelector('input[name="gender"]:checked')?.value;
  const country = countrySelect.value;
  const position = document.getElementById("position").value;

  if (!country || !gender || !position) return;

  submitButton.disabled = true;
  submitButton.textContent = "Сохраняем...";

  try {
    await addParticipant({ country, gender, position });
    form.reset();
    renderStats();
    renderMap();
    alert("Участник успешно добавлен.");
  } catch (error) {
    console.error(error);
    alert("Не удалось сохранить участника. Проверьте подключение к Supabase.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Добавить участника";
  }
});

// Эта кнопка теперь просто обновляет данные из общей базы.
document.getElementById("reset-data").textContent = "Обновить статистику";
document.getElementById("reset-data").addEventListener("click", async () => {
  try {
    await loadParticipants();
    renderStats();
    renderMap();
  } catch (error) {
    console.error(error);
    alert("Не удалось обновить статистику.");
  }
});

async function init() {
  try {
    const geoResponse = await fetch(GEO_URL);
    if (!geoResponse.ok) throw new Error("Не удалось загрузить карту стран.");
    const geo = await geoResponse.json();
    countries = geo.features || [];
    fillCountrySelect(countries);

    await loadParticipants();
    renderMap();
    renderStats();
  } catch (error) {
    console.error(error);
    countrySelect.innerHTML = '<option value="">Ошибка загрузки</option>';
    document.getElementById("top-countries").innerHTML =
      '<div class="muted">Не удалось загрузить общую статистику.</div>';
  }
}

init();
