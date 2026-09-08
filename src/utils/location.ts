import Fuse from 'fuse.js';

/** Location normalize + fuzzy match (Fuse.js) + known-places dictionary. */

export function normalizeLocation(s: string): string {
  return (s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Known Indian states, UTs and popular trip places — catches typos of places never entered before ("gao" → "Goa"). */
export const KNOWN_LOCATIONS: string[] = [
  // States
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal',
  // Union Territories
  'Andaman and Nicobar', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'New Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
  // Major cities
  'Mumbai', 'Kolkata', 'Chennai', 'Bengaluru', 'Hyderabad', 'Ahmedabad', 'Pune',
  'Surat', 'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane', 'Bhopal',
  'Visakhapatnam', 'Patna', 'Vadodara', 'Ludhiana', 'Agra', 'Nashik', 'Faridabad',
  'Meerut', 'Rajkot', 'Varanasi', 'Srinagar', 'Aurangabad', 'Amritsar', 'Prayagraj',
  'Ranchi', 'Coimbatore', 'Jabalpur', 'Gwalior', 'Jodhpur', 'Madurai', 'Raipur',
  'Kota', 'Guwahati', 'Solapur', 'Mysuru', 'Bareilly', 'Jalandhar', 'Bhubaneswar',
  'Salem', 'Thiruvananthapuram', 'Kochi', 'Gorakhpur', 'Bikaner', 'Noida',
  'Jamshedpur', 'Cuttack', 'Dehradun', 'Nanded', 'Kolhapur', 'Ajmer', 'Ujjain',
  'Siliguri', 'Jhansi', 'Jammu', 'Tirunelveli', 'Udaipur', 'Ayodhya', 'Mathura',
  // Hills
  'Shimla', 'Manali', 'Kasol', 'Dharamshala', 'McLeodganj', 'Dalhousie', 'Spiti',
  'Leh', 'Gulmarg', 'Pahalgam', 'Sonmarg', 'Rishikesh', 'Haridwar', 'Mussoorie',
  'Nainital', 'Auli', 'Jim Corbett', 'Lansdowne', 'Kausani', 'Almora', 'Mukteshwar',
  'Mount Abu', 'Matheran', 'Lonavala', 'Mahabaleshwar', 'Panchgani', 'Coorg',
  'Chikmagalur', 'Ooty', 'Coonoor', 'Kodaikanal', 'Munnar', 'Yercaud', 'Darjeeling',
  'Gangtok', 'Shillong', 'Tawang', 'Ziro', 'Dzukou', 'Nubra Valley', 'Pangong Lake',
  'Tso Moriri', 'Bir Billing', 'Khajjiar', 'Chopta', 'Valley of Flowers',
  // Beaches / Goa
  'Panaji', 'Panjim', 'Mapusa', 'Vasco', 'Margao', 'Anjuna', 'Vagator', 'Baga',
  'Calangute', 'Candolim', 'Morjim', 'Ashwem', 'Arambol', 'Chapora', 'Siolim',
  'Colva', 'Benaulim', 'Palolem', 'Agonda', 'Patnem', 'Dudhsagar', 'Alibaug',
  'Kashid', 'Tarkarli', 'Malvan', 'Gokarna', 'Murudeshwar', 'Udupi', 'Malpe',
  'Maravanthe', 'Kovalam', 'Varkala', 'Alleppey', 'Marari', 'Cherai', 'Kovalam',
  'Puri', 'Konark', 'Chandrabhaga', 'Digha', 'Mandarmani', 'Bakkhali',
  'Mahabalipuram', 'Pondicherry', 'Auroville', 'Paradise Beach', 'Rameswaram',
  'Dhanushkodi', 'Kanyakumari', 'Tuticorin', 'Tiruchendur', 'Diu', 'Daman',
  'Dwarka', 'Somnath', 'Mandvi', 'Kovalam',
  // Desert / heritage
  'Jaisalmer', 'Pushkar', 'Chittorgarh', 'Kumbhalgarh', 'Ranthambore', 'Bharatpur',
  'Alwar', 'Sariska', 'Bundi', 'Shekhawati', 'Mandawa', 'Orchha', 'Khajuraho',
  'Sanchi', 'Mandu', 'Maheshwar', 'Omkareshwar', 'Hampi', 'Badami', 'Bijapur',
  'Bidar', 'Rann of Kutch', 'Bhuj', 'Champaner', 'Patan', 'Modhera', 'Lothal',
  'Dholavira', 'Fatehpur Sikri', 'Sarnath', 'Kushinagar', 'Bodh Gaya', 'Nalanda',
  'Rajgir', 'Vaishali', 'Sravasti', 'Thanjavur', 'Darasuram', 'Kanchipuram',
  'Chidambaram', 'Madurai', 'Tiruchirappalli', 'Srirangam', 'Kumbakonam',
  // Wildlife / nature
  'Ranthambore', 'Bandhavgarh', 'Kanha', 'Pench', 'Tadoba', 'Gir', 'Kaziranga',
  'Sundarbans', 'Periyar', 'Nagarhole', 'Bandipur', 'Mudumalai', 'Bharatpur',
  'Keoladeo', 'Chilika', 'Vedanthangal', 'Kumarakom', 'Thattekad', 'Eravikulam',
  // Pilgrim
  'Tirupati', 'Shirdi', 'Vaishno Devi', 'Katva', 'Amarnath', 'Kedarnath',
  'Badrinath', 'Gangotri', 'Yamunotri', 'Dwarka', 'Puri', 'Rameswaram',
  'Madurai', 'Kanyakumari', 'Sabarimala', 'Guruvayur', 'Udupi', 'Dharmasthala',
  'Kukke', 'Sringeri', 'Murudeshwar', 'Gokarna', 'Hampi', 'Thanjavur',
];

const fuseOptions = {
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.45,
  minMatchCharLength: 2,
};

/**
 * Ranked suggestions for what the user is typing.
 * Existing trip locations first, then the known-places dictionary.
 * Never auto-saves — the user always picks.
 */
export function suggestLocations(input: string, existing: string[], limit = 5): string[] {
  const q = normalizeLocation(input);
  if (q.length < 2) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: string) => {
    const k = v.toLowerCase();
    if (!seen.has(k) && k !== q.toLowerCase()) {
      seen.add(k);
      out.push(v);
    }
  };
  const fExisting = new Fuse(existing, fuseOptions);
  fExisting.search(q).slice(0, limit).forEach((r) => push(r.item));
  if (out.length < limit) {
    const fKnown = new Fuse(KNOWN_LOCATIONS, fuseOptions);
    fKnown.search(q).slice(0, limit - out.length).forEach((r) => push(r.item));
  }
  return out.slice(0, limit);
}

/**
 * What to do on save: exact match → canonical; close match → ask user;
 * nothing close → new normalized location.
 */
export function resolveLocationOnSave(
  input: string,
  existing: string[]
): { kind: 'exact'; value: string } | { kind: 'ask'; value: string; suggestion: string } | { kind: 'new'; value: string } {
  const norm = normalizeLocation(input);
  if (!norm) return { kind: 'new', value: '' };
  const lower = norm.toLowerCase();
  for (const e of existing) {
    if (e.toLowerCase() === lower) return { kind: 'exact', value: e };
  }
  const pool = [...existing, ...KNOWN_LOCATIONS.filter((k) => !existing.some((e) => e.toLowerCase() === k.toLowerCase()))];
  const best = new Fuse(pool, { ...fuseOptions, threshold: 0.4 }).search(norm)[0];
  if (best && best.item.toLowerCase() !== lower) {
    return { kind: 'ask', value: norm, suggestion: best.item };
  }
  return { kind: 'new', value: norm };
}

/** Unique location list for the dropdown — grows as users add (no master list). */
export function uniqueLocations(items: { cityName: string }[]): string[] {
  const seen = new Map<string, string>();
  for (const it of items) {
    const norm = normalizeLocation(it.cityName || '');
    if (!norm) continue;
    const key = norm.toLowerCase();
    if (!seen.has(key)) seen.set(key, norm);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}
