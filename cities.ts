// Shared between main.tsx (game UI) and globe.tsx (3D rendering).
// lat/lon are real-world coordinates, used to place each city on the sphere.
// NOTE: worker.ts keeps its own copy of price/rent data (server is the source of
// truth for money); this file only needs to stay in sync on price/rent numbers,
// not on lat/lon, since the server never uses coordinates.

export interface CityDef {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  price: number;
  baseRent: number;
  group: string;
}

export const CITIES: Record<string, CityDef> = {
  london: { id: "london", name: "London", country: "United Kingdom", countryCode: "GB", lat: 51.5074, lon: -0.1278, price: 2600, baseRent: 220, group: "europe" },
  paris: { id: "paris", name: "Paris", country: "France", countryCode: "FR", lat: 48.8566, lon: 2.3522, price: 2400, baseRent: 200, group: "europe" },
  hamburg: { id: "hamburg", name: "Hamburg", country: "Germany", countryCode: "DE", lat: 53.5511, lon: 9.9937, price: 1600, baseRent: 130, group: "germany" },
  berlin: { id: "berlin", name: "Berlin", country: "Germany", countryCode: "DE", lat: 52.52, lon: 13.405, price: 1900, baseRent: 160, group: "germany" },
  dortmund: { id: "dortmund", name: "Dortmund", country: "Germany", countryCode: "DE", lat: 51.5136, lon: 7.4653, price: 1200, baseRent: 95, group: "germany" },
  koeln: { id: "koeln", name: "Köln", country: "Germany", countryCode: "DE", lat: 50.9375, lon: 6.9603, price: 1350, baseRent: 105, group: "germany" },
  duesseldorf: { id: "duesseldorf", name: "Düsseldorf", country: "Germany", countryCode: "DE", lat: 51.2277, lon: 6.7735, price: 1300, baseRent: 100, group: "germany" },
  muenchen: { id: "muenchen", name: "München", country: "Germany", countryCode: "DE", lat: 48.1351, lon: 11.582, price: 2100, baseRent: 175, group: "germany" },
  newyork: { id: "newyork", name: "New York", country: "USA", countryCode: "US", lat: 40.7128, lon: -74.006, price: 3200, baseRent: 280, group: "usa" },
  chicago: { id: "chicago", name: "Chicago", country: "USA", countryCode: "US", lat: 41.8781, lon: -87.6298, price: 2200, baseRent: 190, group: "usa" },
  losangeles: { id: "losangeles", name: "Los Angeles", country: "USA", countryCode: "US", lat: 34.0522, lon: -118.2437, price: 2900, baseRent: 250, group: "usa" },
  miami: { id: "miami", name: "Miami", country: "USA", countryCode: "US", lat: 25.7617, lon: -80.1918, price: 2000, baseRent: 170, group: "usa" },
  saopaulo: { id: "saopaulo", name: "São Paulo", country: "Brazil", countryCode: "BR", lat: -23.5505, lon: -46.6333, price: 1500, baseRent: 120, group: "samerica" },
  buenosaires: { id: "buenosaires", name: "Buenos Aires", country: "Argentina", countryCode: "AR", lat: -34.6037, lon: -58.3816, price: 1400, baseRent: 110, group: "samerica" },
  tokyo: { id: "tokyo", name: "Tokyo", country: "Japan", countryCode: "JP", lat: 35.6762, lon: 139.6503, price: 3400, baseRent: 300, group: "japan" },
  osaka: { id: "osaka", name: "Osaka", country: "Japan", countryCode: "JP", lat: 34.6937, lon: 135.5023, price: 2300, baseRent: 195, group: "japan" },
  kyoto: { id: "kyoto", name: "Kyoto", country: "Japan", countryCode: "JP", lat: 35.0116, lon: 135.7681, price: 2000, baseRent: 165, group: "japan" },
  sydney: { id: "sydney", name: "Sydney", country: "Australia", countryCode: "AU", lat: -33.8688, lon: 151.2093, price: 2500, baseRent: 210, group: "oceania" },
};

export const BOARD_ORDER: string[] = [
  "london", "paris", "hamburg", "berlin", "dortmund", "koeln", "duesseldorf", "muenchen",
  "newyork", "chicago", "losangeles", "miami",
  "saopaulo", "buenosaires",
  "sydney",
  "tokyo", "osaka", "kyoto",
];

export const PLAYER_COLORS = ["#C9A227", "#3E8E7E", "#B8543F", "#6C7DD9", "#D98E4A", "#9B6BC9"];
