/** Discover feed — P1 skeleton: curated static content, zero network cost.
 *  Card shapes are API-ready (P2 swaps this file for OpenTripMap/Unsplash
 *  fetchers returning the same types). Covers are gradient + lucide icon
 *  (offline-safe, no image assets until P2). */

export type DiscoverKind = 'package' | 'city' | 'editorial';

export interface DiscoverPackage {
  id: string;
  kind: 'package';
  title: string;
  destination: string;
  duration: string;
  price: number;
  priceNote: string;
  dates: string;
  highlights: string[];
  availability: string;
  seatsLeft: number;
  gradient: string;
  icon: 'mountain' | 'palmtree' | 'waves';
  overview: string;
  itinerary: { day: string; title: string; text: string }[];
  inclusions: string[];
  exclusions: string[];
  priceBreakup: { label: string; amount: number }[];
  dateOptions: { label: string; seats: number }[];
  cancellation: string;
  organiser: { name: string; phone: string };
}

export interface DiscoverCity {
  id: string;
  kind: 'city';
  title: string;
  subtitle: string;
  rating: number;
  season: string;
  gradient: string;
  icon: 'building' | 'landmark' | 'tent';
}

export interface DiscoverEditorial {
  id: string;
  kind: 'editorial';
  title: string;
  subtitle: string;
  gradient: string;
}

export type DiscoverItem = DiscoverPackage | DiscoverCity | DiscoverEditorial;

export const DISCOVER_PACKAGES: DiscoverPackage[] = [
  {
    id: 'pkg_ladakh',
    kind: 'package',
    title: 'Ladakh Expedition',
    destination: 'Leh · Nubra · Pangong',
    duration: '10D / 9N',
    price: 24999,
    priceNote: 'per person, twin sharing',
    dates: 'Jun – Sep · weekly departures',
    highlights: ['Pangong sunrise', 'Khardung La pass', 'Nubra dunes + camel ride'],
    availability: 'Filling fast',
    seatsLeft: 6,
    gradient: 'from-sky-500 via-indigo-600 to-violet-700',
    icon: 'mountain',
    overview:
      'The classic high-altitude circuit: Leh old town and monasteries, the Nubra dunes across Khardung La, and a night on the banks of Pangong Tso. Oxygen-equipped camps, experienced mountain crew, and a pace that respects acclimatisation.',
    itinerary: [
      { day: 'Day 1–2', title: 'Arrive Leh · acclimatise', text: 'Airport pickup, rest day, evening Shanti Stupa walk. Medical check + oxygen briefing.' },
      { day: 'Day 3', title: 'Leh local', text: 'Thiksey + Hemis monasteries, Magnetic Hill, Hall of Fame.' },
      { day: 'Day 4–5', title: 'Nubra via Khardung La', text: 'Highest motorable pass crossing, Diskit Buddha, Hunder dunes double-hump ride.' },
      { day: 'Day 6–7', title: 'Pangong Tso', text: 'Shyok route to the lake, overnight lakeside camp, sunrise shoot.' },
      { day: 'Day 8', title: 'Hanle (optional dark-sky)', text: 'Highest observatory visit, Milky Way night session.' },
      { day: 'Day 9–10', title: 'Return Leh · fly out', text: 'Souvenir morning, drop to Leh airport with trip photo book.' },
    ],
    inclusions: [
      '9 nights stay (hotel + Swiss camps)',
      'Daily breakfast + dinner',
      'Oxygen-equipped tempo traveller',
      'Inner-line permits + fees',
      'Trip captain + oxygen support',
    ],
    exclusions: ['Flights to/from Leh', 'Lunches + personal expenses', 'Travel insurance', 'Anything not in inclusions'],
    priceBreakup: [
      { label: 'Stay (9N)', amount: 12500 },
      { label: 'Transport + permits', amount: 7000 },
      { label: 'Meals + crew', amount: 4000 },
      { label: 'Taxes + fees', amount: 1499 },
    ],
    dateOptions: [
      { label: '14 Jun – 23 Jun', seats: 6 },
      { label: '05 Jul – 14 Jul', seats: 11 },
      { label: '02 Aug – 11 Aug', seats: 14 },
    ],
    cancellation: '30+ days: 90% refund · 15–29 days: 50% · under 15 days: non-refundable. Full refund if we cancel.',
    organiser: { name: 'WanderSync Experiences', phone: '+91 98000 11223' },
  },
  {
    id: 'pkg_manali',
    kind: 'package',
    title: 'Manali Long Weekend',
    destination: 'Manali · Solang · Atal Tunnel',
    duration: '4D / 3N',
    price: 8999,
    priceNote: 'per person, twin sharing',
    dates: 'Every Fri departure',
    highlights: ['Solang paragliding', 'Sissu waterfalls', 'Old Manali café crawl'],
    availability: 'Available',
    seatsLeft: 18,
    gradient: 'from-emerald-500 via-teal-600 to-cyan-700',
    icon: 'palmtree',
    overview:
      'A compact mountain reset: Volvo from Delhi, two full days across Solang valley and Sissu, and one slow Old Manali day. Ideal first group trip.',
    itinerary: [
      { day: 'Day 1', title: 'Overnight Volvo ex-Delhi', text: 'Evening boarding, sleeper Volvo to Manali.' },
      { day: 'Day 2', title: 'Solang + Atal Tunnel', text: 'Adventure activities, tunnel crossing to Sissu falls.' },
      { day: 'Day 3', title: 'Old Manali slow day', text: 'Hadimba temple, café crawl, Mall Road evening.' },
      { day: 'Day 4', title: 'Return Volvo', text: 'Morning checkout, evening drop to Delhi.' },
    ],
    inclusions: ['Volvo both ways', '3N hotel + breakfast', 'Sightseeing cab', 'Trip captain'],
    exclusions: ['Adventure activity tickets', 'Lunches + dinner', 'Personal expenses'],
    priceBreakup: [
      { label: 'Stay (3N)', amount: 4200 },
      { label: 'Volvo + cab', amount: 3200 },
      { label: 'Taxes + fees', amount: 1599 },
    ],
    dateOptions: [
      { label: 'Every Friday', seats: 18 },
      { label: 'Long weekends', seats: 9 },
    ],
    cancellation: '7+ days: full refund · under 7 days: 50% · Volvo seats non-refundable inside 72 hrs.',
    organiser: { name: 'WanderSync Experiences', phone: '+91 98000 11223' },
  },
  {
    id: 'pkg_goa',
    kind: 'package',
    title: 'Goa Slow Days',
    destination: 'North Goa · Morjim · Ashwem',
    duration: '3D / 2N',
    price: 7499,
    priceNote: 'per person, twin sharing',
    dates: 'Nov – Feb · daily',
    highlights: ['Silent-noise party', 'Dolphin kayaking', 'Portuguese villa stay'],
    availability: 'Available',
    seatsLeft: 22,
    gradient: 'from-amber-500 via-orange-600 to-rose-600',
    icon: 'waves',
    overview:
      'Skip Baga crowds: a quiet North Goa pocket with a heritage villa, morning kayaks, and one legendary silent party night.',
    itinerary: [
      { day: 'Day 1', title: 'Arrive + villa evening', text: 'Check-in, pool + sunset at Ashwem.' },
      { day: 'Day 2', title: 'Kayak + silent party', text: 'Morning dolphin kayaking, night silent-noise headphone party.' },
      { day: 'Day 3', title: 'Flea market + fly out', text: 'Anjuna flea market, evening departures.' },
    ],
    inclusions: ['2N heritage villa', 'Breakfast both days', 'Kayak session', 'Party entry'],
    exclusions: ['Flights/trains', 'Lunches + dinner', 'Scooter rental'],
    priceBreakup: [
      { label: 'Stay (2N)', amount: 3800 },
      { label: 'Experiences', amount: 2200 },
      { label: 'Taxes + fees', amount: 1499 },
    ],
    dateOptions: [
      { label: 'Daily, Nov – Feb', seats: 22 },
    ],
    cancellation: '7+ days: full refund · under 7 days: non-refundable.',
    organiser: { name: 'WanderSync Experiences', phone: '+91 98000 11223' },
  },
];

export const DISCOVER_CITIES: DiscoverCity[] = [
  { id: 'city_jaipur', kind: 'city', title: 'Jaipur', subtitle: 'Pink City forts + bazaars', rating: 4.6, season: 'Oct – Mar', gradient: 'from-rose-500 via-pink-600 to-fuchsia-700', icon: 'landmark' },
  { id: 'city_kochi', kind: 'city', title: 'Kochi', subtitle: 'Fort Kochi + backwaters', rating: 4.5, season: 'Sep – Feb', gradient: 'from-teal-500 via-emerald-600 to-green-700', icon: 'building' },
  { id: 'city_spiti', kind: 'city', title: 'Spiti', subtitle: 'Moonland + monasteries', rating: 4.8, season: 'Jun – Sep', gradient: 'from-slate-500 via-slate-600 to-indigo-800', icon: 'tent' },
];

export const DISCOVER_EDITORIALS: DiscoverEditorial[] = [
  { id: 'ed_must_india', kind: 'editorial', title: 'Must-Visit India', subtitle: '12 places before you turn 30 →', gradient: 'from-indigo-600 via-violet-600 to-purple-700' },
  { id: 'ed_budget', kind: 'editorial', title: 'Under ₹10k escapes', subtitle: 'Weekend trips that respect the wallet →', gradient: 'from-amber-500 via-orange-600 to-red-600' },
];

export function inr(n: number): string {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}
