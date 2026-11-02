import { airports } from '@/services/travel/reference'
import type { LatLng } from './geo'

export type PoiKind = 'attraction' | 'hotel'

export interface Poi extends LatLng {
  id: string
  kind: PoiKind
  title: string
  detail: string
}

export const KIND_LABEL: Record<PoiKind, string> = { attraction: 'Attractions', hotel: 'Hotels' }

// Real landmarks, approximate coordinates (for orientation only).
const LANDMARKS: Record<string, { title: string; lat: number; lng: number }[]> = {
  Paris: [
    { title: 'Eiffel Tower', lat: 48.8584, lng: 2.2945 },
    { title: 'Louvre Museum', lat: 48.8606, lng: 2.3376 },
    { title: 'Notre-Dame de Paris', lat: 48.853, lng: 2.3499 },
  ],
  'Abu Dhabi': [
    { title: 'Sheikh Zayed Grand Mosque', lat: 24.4128, lng: 54.4749 },
    { title: 'Qasr Al Watan', lat: 24.4619, lng: 54.3055 },
    { title: 'Louvre Abu Dhabi', lat: 24.5337, lng: 54.3981 },
  ],
  Amman: [
    { title: 'Amman Citadel', lat: 31.9539, lng: 35.9349 },
    { title: 'Roman Theatre', lat: 31.9517, lng: 35.9393 },
    { title: 'King Abdullah I Mosque', lat: 31.9634, lng: 35.9106 },
  ],
  Cairo: [
    { title: 'Egyptian Museum', lat: 30.0478, lng: 31.2336 },
    { title: 'Khan el-Khalili', lat: 30.0478, lng: 31.262 },
    { title: 'Cairo Citadel', lat: 30.0298, lng: 31.2618 },
  ],
  Riyadh: [
    { title: 'Masmak Fortress', lat: 24.6311, lng: 46.7133 },
    { title: 'National Museum of Saudi Arabia', lat: 24.6478, lng: 46.7113 },
    { title: 'Kingdom Centre', lat: 24.7113, lng: 46.6744 },
  ],
  Jeddah: [
    { title: 'Historic Jeddah (Al-Balad)', lat: 21.4858, lng: 39.1925 },
    { title: 'King Fahd Fountain', lat: 21.515, lng: 39.1528 },
    { title: 'Jeddah Corniche', lat: 21.607, lng: 39.108 },
  ],
  Doha: [
    { title: 'Museum of Islamic Art', lat: 25.2955, lng: 51.5392 },
    { title: 'Souq Waqif', lat: 25.2867, lng: 51.5333 },
    { title: 'Katara Cultural Village', lat: 25.3615, lng: 51.5263 },
  ],
  Muscat: [
    { title: 'Sultan Qaboos Grand Mosque', lat: 23.5833, lng: 58.3894 },
    { title: 'Mutrah Souq', lat: 23.6165, lng: 58.5633 },
    { title: 'Royal Opera House Muscat', lat: 23.6139, lng: 58.4059 },
  ],
  Tunis: [
    { title: 'Medina of Tunis', lat: 36.7989, lng: 10.1717 },
    { title: 'Bardo National Museum', lat: 36.8094, lng: 10.1342 },
    { title: 'Bab el Bhar', lat: 36.7986, lng: 10.18 },
  ],
  Algiers: [
    { title: 'Kasbah of Algiers', lat: 36.7854, lng: 3.0606 },
    { title: 'Martyrs’ Memorial', lat: 36.7458, lng: 3.0703 },
    { title: 'Notre-Dame d’Afrique', lat: 36.8075, lng: 3.0456 },
  ],
  Beirut: [
    { title: 'National Museum of Beirut', lat: 33.8833, lng: 35.5131 },
    { title: 'Mohammad Al-Amin Mosque', lat: 33.8958, lng: 35.5055 },
    { title: 'Raouche Rocks', lat: 33.8886, lng: 35.4697 },
  ],
  Casablanca: [
    { title: 'Hassan II Mosque', lat: 33.6084, lng: -7.6326 },
    { title: 'Place des Nations Unies', lat: 33.5944, lng: -7.6192 },
    { title: 'Rick’s Café', lat: 33.6043, lng: -7.623 },
  ],
  London: [
    { title: 'Tower Bridge', lat: 51.5055, lng: -0.0754 },
    { title: 'British Museum', lat: 51.5194, lng: -0.127 },
    { title: 'London Eye', lat: 51.5033, lng: -0.1195 },
  ],
  Dublin: [
    { title: 'Trinity College Dublin', lat: 53.3438, lng: -6.2546 },
    { title: 'Dublin Castle', lat: 53.3429, lng: -6.2674 },
    { title: 'St Patrick’s Cathedral', lat: 53.3394, lng: -6.2711 },
  ],
  Edinburgh: [
    { title: 'Edinburgh Castle', lat: 55.9486, lng: -3.1999 },
    { title: 'Palace of Holyroodhouse', lat: 55.9526, lng: -3.1722 },
    { title: 'National Museum of Scotland', lat: 55.947, lng: -3.189 },
  ],
  Manchester: [
    { title: 'John Rylands Library', lat: 53.4793, lng: -2.247 },
    { title: 'Manchester Cathedral', lat: 53.485, lng: -2.244 },
    { title: 'Science and Industry Museum', lat: 53.4778, lng: -2.255 },
  ],
  Tokyo: [
    { title: 'Senso-ji', lat: 35.7148, lng: 139.7967 },
    { title: 'Tokyo Skytree', lat: 35.7101, lng: 139.8107 },
    { title: 'Meiji Shrine', lat: 35.6764, lng: 139.6993 },
  ],
  Osaka: [
    { title: 'Osaka Castle', lat: 34.6873, lng: 135.5262 },
    { title: 'Dotonbori', lat: 34.6687, lng: 135.5013 },
    { title: 'Shitennoji Temple', lat: 34.6537, lng: 135.5163 },
  ],
  Beijing: [
    { title: 'Forbidden City', lat: 39.9163, lng: 116.3972 },
    { title: 'Temple of Heaven', lat: 39.8822, lng: 116.4066 },
    { title: 'Summer Palace', lat: 39.9999, lng: 116.2755 },
  ],
  Shanghai: [
    { title: 'The Bund', lat: 31.2401, lng: 121.4902 },
    { title: 'Yu Garden', lat: 31.2271, lng: 121.492 },
    { title: 'Shanghai Museum', lat: 31.2304, lng: 121.4691 },
  ],
  Dubai: [
    { title: 'Burj Khalifa', lat: 25.1972, lng: 55.2744 },
    { title: 'The Dubai Mall', lat: 25.1985, lng: 55.2796 },
    { title: 'Dubai Marina', lat: 25.0805, lng: 55.1403 },
  ],
  Istanbul: [
    { title: 'Hagia Sophia', lat: 41.0086, lng: 28.9802 },
    { title: 'Blue Mosque', lat: 41.0054, lng: 28.9768 },
    { title: 'Topkapi Palace', lat: 41.0115, lng: 28.9833 },
  ],
  Rome: [
    { title: 'Colosseum', lat: 41.8902, lng: 12.4922 },
    { title: 'Trevi Fountain', lat: 41.9009, lng: 12.4833 },
    { title: 'Pantheon', lat: 41.8986, lng: 12.4769 },
  ],
  Milan: [
    { title: 'Milan Cathedral', lat: 45.4642, lng: 9.1919 },
    { title: 'Galleria Vittorio Emanuele II', lat: 45.4659, lng: 9.19 },
    { title: 'Sforza Castle', lat: 45.4705, lng: 9.1793 },
  ],
  Venice: [
    { title: 'St Mark’s Basilica', lat: 45.4345, lng: 12.3397 },
    { title: 'Doge’s Palace', lat: 45.4337, lng: 12.3404 },
    { title: 'Rialto Bridge', lat: 45.438, lng: 12.3359 },
  ],
  Madrid: [
    { title: 'Royal Palace of Madrid', lat: 40.4179, lng: -3.7143 },
    { title: 'Prado Museum', lat: 40.4138, lng: -3.6921 },
    { title: 'Plaza Mayor', lat: 40.4155, lng: -3.7074 },
  ],
  Barcelona: [
    { title: 'Sagrada Família', lat: 41.4036, lng: 2.1744 },
    { title: 'Park Güell', lat: 41.4145, lng: 2.1527 },
    { title: 'Casa Batlló', lat: 41.3917, lng: 2.1649 },
  ],
  Berlin: [
    { title: 'Brandenburg Gate', lat: 52.5163, lng: 13.3777 },
    { title: 'Reichstag Building', lat: 52.5186, lng: 13.3762 },
    { title: 'Museum Island', lat: 52.5169, lng: 13.401 },
  ],
  Amsterdam: [
    { title: 'Rijksmuseum', lat: 52.36, lng: 4.8852 },
    { title: 'Anne Frank House', lat: 52.3752, lng: 4.884 },
    { title: 'Royal Palace Amsterdam', lat: 52.373, lng: 4.8913 },
  ],
  Vienna: [
    { title: 'Schönbrunn Palace', lat: 48.1845, lng: 16.3122 },
    { title: 'St Stephen’s Cathedral', lat: 48.2085, lng: 16.3731 },
    { title: 'Belvedere Palace', lat: 48.1915, lng: 16.3808 },
  ],
  Prague: [
    { title: 'Prague Castle', lat: 50.0909, lng: 14.4005 },
    { title: 'Charles Bridge', lat: 50.0865, lng: 14.4114 },
    { title: 'Old Town Square', lat: 50.087, lng: 14.4213 },
  ],
  Athens: [
    { title: 'Acropolis of Athens', lat: 37.9715, lng: 23.7257 },
    { title: 'Parthenon', lat: 37.9715, lng: 23.7267 },
    { title: 'Panathenaic Stadium', lat: 37.9683, lng: 23.7411 },
  ],
  Lisbon: [
    { title: 'Belém Tower', lat: 38.6916, lng: -9.216 },
    { title: 'Jerónimos Monastery', lat: 38.6979, lng: -9.2067 },
    { title: 'São Jorge Castle', lat: 38.7139, lng: -9.1335 },
  ],
  Singapore: [
    { title: 'Gardens by the Bay', lat: 1.2816, lng: 103.8636 },
    { title: 'Merlion Park', lat: 1.2868, lng: 103.8545 },
    { title: 'National Gallery Singapore', lat: 1.2906, lng: 103.8519 },
  ],
  Bangkok: [
    { title: 'Grand Palace', lat: 13.7501, lng: 100.4913 },
    { title: 'Wat Arun', lat: 13.7437, lng: 100.4889 },
    { title: 'Wat Pho', lat: 13.7465, lng: 100.4927 },
  ],
  Seoul: [
    { title: 'Gyeongbokgung Palace', lat: 37.5796, lng: 126.977 },
    { title: 'Bukchon Hanok Village', lat: 37.5826, lng: 126.983 },
    { title: 'N Seoul Tower', lat: 37.5512, lng: 126.9882 },
  ],
  'New York': [
    { title: 'Statue of Liberty', lat: 40.6892, lng: -74.0445 },
    { title: 'Central Park', lat: 40.7829, lng: -73.9654 },
    { title: 'Empire State Building', lat: 40.7484, lng: -73.9857 },
  ],
  'Los Angeles': [
    { title: 'Griffith Observatory', lat: 34.1184, lng: -118.3004 },
    { title: 'The Getty Center', lat: 34.078, lng: -118.4741 },
    { title: 'Santa Monica Pier', lat: 34.0092, lng: -118.4976 },
  ],
  Chicago: [
    { title: 'Millennium Park', lat: 41.8826, lng: -87.6226 },
    { title: 'Art Institute of Chicago', lat: 41.8796, lng: -87.6237 },
    { title: 'Navy Pier', lat: 41.8917, lng: -87.6078 },
  ],
  'San Francisco': [
    { title: 'Golden Gate Bridge', lat: 37.8199, lng: -122.4783 },
    { title: 'Ferry Building', lat: 37.7955, lng: -122.3937 },
    { title: 'Lombard Street', lat: 37.8021, lng: -122.4187 },
  ],
  Toronto: [
    { title: 'CN Tower', lat: 43.6426, lng: -79.3871 },
    { title: 'Royal Ontario Museum', lat: 43.6677, lng: -79.3948 },
    { title: 'Art Gallery of Ontario', lat: 43.654, lng: -79.3929 },
  ],
  Vancouver: [
    { title: 'Stanley Park', lat: 49.3043, lng: -123.1443 },
    { title: 'Granville Island Public Market', lat: 49.2713, lng: -123.134 },
    { title: 'Vancouver Art Gallery', lat: 49.2829, lng: -123.1207 },
  ],
  'Mexico City': [
    { title: 'Zócalo', lat: 19.4326, lng: -99.1332 },
    { title: 'National Museum of Anthropology', lat: 19.426, lng: -99.186 },
    { title: 'Palacio de Bellas Artes', lat: 19.4352, lng: -99.1412 },
  ],
  'Rio de Janeiro': [
    { title: 'Christ the Redeemer', lat: -22.9519, lng: -43.2105 },
    { title: 'Sugarloaf Mountain', lat: -22.9492, lng: -43.1545 },
    { title: 'Copacabana Beach', lat: -22.9711, lng: -43.1822 },
  ],
  'Cape Town': [
    { title: 'Table Mountain Aerial Cableway', lat: -33.9628, lng: 18.4098 },
    { title: 'V&A Waterfront', lat: -33.9036, lng: 18.4208 },
    { title: 'Castle of Good Hope', lat: -33.9253, lng: 18.4278 },
  ],
  Sydney: [
    { title: 'Sydney Opera House', lat: -33.8568, lng: 151.2153 },
    { title: 'Sydney Harbour Bridge', lat: -33.8523, lng: 151.2108 },
    { title: 'Royal Botanic Garden Sydney', lat: -33.8642, lng: 151.2166 },
  ],
  Melbourne: [
    { title: 'Federation Square', lat: -37.8179, lng: 144.969 },
    { title: 'Royal Exhibition Building', lat: -37.8047, lng: 144.9717 },
    { title: 'National Gallery of Victoria', lat: -37.8226, lng: 144.9689 },
  ],
  Bali: [
    { title: 'Uluwatu Temple', lat: -8.8291, lng: 115.0849 },
    { title: 'Tanah Lot', lat: -8.6212, lng: 115.0868 },
    { title: 'Ubud Palace', lat: -8.5069, lng: 115.2625 },
  ],
}

export const mapCities = airports.map((airport) => airport.city)

export function cityCenter(city: string): LatLng {
  const a = airports.find((x) => x.city === city)
  return a ? { lat: a.lat, lng: a.lng } : { lat: 0, lng: 0 }
}

export function poisForCity(city: string): Poi[] {
  return (LANDMARKS[city] ?? []).map((landmark, index) => ({
    id: `${city}-a${index}`,
    kind: 'attraction',
    title: landmark.title,
    detail: 'Landmark (approximate location)',
    lat: landmark.lat,
    lng: landmark.lng,
  }))
}
