/** Catchment basins → districts (verbatim from ew/dashboard/config.py CATCHMENT_BASINS). District
 * names match the cleaned GADM NAME_2 in tz_districts_gadm.geojson (display_name). */
export interface BasinDef { key: string; label: string; districts: string[]; }
export const CATCHMENT_BASINS: BasinDef[] = [
  { key: 'Pangani', label: 'Pangani Basin', districts: ['Hai', 'Moshi Rural', 'Moshi Urban', 'Mwanga', 'Rombo', 'Same', 'Siha', 'Korogwe', 'Korogwe Town', 'Lushoto', 'Muheza', 'Pangani', 'Handeni', 'Handeni Town', 'Kilindi', 'Mkinga', 'Tanga', 'Babati', 'Babati Urban', 'Simanjiro'] },
  { key: 'Wami-Ruvu', label: 'Wami / Ruvu Basin', districts: ['Bagamoyo', 'Kibaha', 'Kibaha Urban', 'Kisarawe', 'Mkuranga', 'Morogoro Rural', 'Morogoro Urban', 'Mvomero', 'Gairo', 'Kilosa', 'Chamwino', 'Dodoma Urban', 'Kongwa', 'Mpwapwa', 'Ilala', 'Kinondoni', 'Temeke'] },
  { key: 'Rufiji', label: 'Rufiji Basin', districts: ['Rufiji', 'Kilombero', 'Ulanga', 'Mafia', 'Iringa Rural', 'Iringa Urban', 'Kilolo', 'Mufindi', 'Mafinga Town', 'Ludewa', 'Makete', 'Njombe Rural', 'Njombe Urban', 'Makambako Town', 'Wanging\'ombe', 'Mbarali', 'Chunya', 'Manyoni', 'Ikungi'] },
  { key: 'Ruvuma', label: 'Ruvuma Basin', districts: ['Songea Rural', 'Songea Urban', 'Mbinga', 'Nyasa', 'Namtumbo', 'Tunduru', 'Nachingwea', 'Liwale', 'Ruangwa', 'Masasi', 'Masasi Town', 'Nanyumbu', 'Newala', 'Tandahimba', 'Mtwara Rural', 'Mtwara Urban'] },
  { key: 'Lake Victoria', label: 'Lake Victoria Basin', districts: ['Ilemela', 'Kwimba', 'Magu', 'Misungwi', 'Nyamagana', 'Sengerema', 'Ukerewe', 'Bukoba Rural', 'Bukoba Urban', 'Karagwe', 'Kyerwa', 'Missenyi', 'Muleba', 'Ngara', 'Biharamulo', 'Bunda', 'Butiama', 'Musoma Rural', 'Musoma Urban', 'Rorya', 'Serengeti', 'Tarime', 'Geita', 'Mbogwe', 'Nyang\'hwale', 'Bukombe', 'Chato', 'Bariadi', 'Busega', 'Itilima', 'Maswa', 'Meatu', 'Kahama', 'Kahama Town', 'Kishapu', 'Shinyanga Rural', 'Shinyanga Urban'] },
  { key: 'Lake Tanganyika', label: 'Lake Tanganyika Basin', districts: ['Kigoma Rural', 'Kigoma Urban', 'Kasulu', 'Kasulu Town', 'Buhigwe', 'Kakonko', 'Kibondo', 'Uvinza', 'Nkasi', 'Sumbawanga Rural', 'Sumbawanga Urban', 'Kalambo', 'Mpanda Rural', 'Mpanda Urban', 'Mlele'] },
  { key: 'Lake Nyasa', label: 'Lake Nyasa Basin', districts: ['Ludewa', 'Nyasa', 'Mbinga', 'Kyela', 'Rungwe', 'Mbeya Rural', 'Mbeya Urban', 'Ileje', 'Mbozi', 'Momba', 'Songwe', 'Tunduma'] },
  { key: 'Lake Rukwa', label: 'Lake Rukwa Basin', districts: ['Sumbawanga Rural', 'Sumbawanga Urban', 'Nkasi', 'Kalambo', 'Mpanda Rural', 'Mpanda Urban', 'Mlele', 'Chunya', 'Mbarali'] },
  { key: 'Internal Drainage', label: 'Internal Drainage Basin', districts: ['Bahi', 'Chamwino', 'Chemba', 'Dodoma Urban', 'Kondoa', 'Singida Rural', 'Singida Urban', 'Iramba', 'Mkalama', 'Hanang', 'Mbulu', 'Karatu', 'Ngorongoro', 'Monduli', 'Longido', 'Arusha', 'Arusha Urban', 'Meru', 'Kiteto', 'Simanjiro', 'Igunga', 'Nzega', 'Sikonge', 'Tabora', 'Urambo', 'Uyui', 'Kaliua'] },
  { key: 'Indian Ocean Coast', label: 'Indian Ocean Coastal', districts: ['Tanga', 'Pangani', 'Mkinga', 'Bagamoyo', 'Ilala', 'Kinondoni', 'Temeke', 'Kibaha', 'Mkuranga', 'Mafia', 'Rufiji', 'Kilwa', 'Lindi Rural', 'Lindi Urban', 'Mtwara Rural', 'Mtwara Urban'] },
];

/** district → basins[] reverse lookup (a district can belong to several basins). */
export const DISTRICT_TO_BASINS: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  for (const b of CATCHMENT_BASINS) for (const d of b.districts) (m[d] ??= []).push(b.key);
  return m;
})();
export const BASIN_BY_KEY: Record<string, BasinDef> = Object.fromEntries(CATCHMENT_BASINS.map(b => [b.key, b]));

