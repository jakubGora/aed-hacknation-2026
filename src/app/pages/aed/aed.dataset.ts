/**
 * Metadata of the shared dataset, aligned with the dane.gov.pl XML import schema
 * (urn:otwarte-dane:harvester:1.13, https://dane.gov.pl/static/xml/otwarte_dane_latest.xsd).
 * The portal allows one institution per dataset, so the shared dataset has one publisher
 * and every row keeps its own `regon_dysponenta`.
 */
export const AED_DATASET = {
  extIdent: 'aed-polska',
  publisher: 'Wydawca zbioru do ustalenia z organizatorem (np. Ministerstwo Cyfryzacji)',
  title: { polish: 'Defibrylatory AED w Polsce', english: 'AED defibrillators in Poland' },
  description: {
    polish: 'Ogólnopolski zbiór lokalizacji automatycznych defibrylatorów zewnętrznych (AED) z informacją o dostępności, stanie urządzenia i dacie weryfikacji. Dane przekazują i aktualizują dysponenci urządzeń w ramach akcji „Daj impuls”. Każdy rekord wskazuje dysponenta (REGON) odpowiedzialnego za dane.',
    english: 'Nationwide dataset of automated external defibrillator (AED) locations with access hours, device status and verification date, maintained by AED owners within the "Daj impuls" campaign.',
  },
  url: 'https://dane.gov.pl/pl/aed',
  updateFrequency: 'daily',
  categories: ['HEAL', 'SOCI'],
  license: 'CC BY 4.0',
  tags: ['AED', 'defibrylator', 'pierwsza pomoc', 'zdrowie', 'Daj impuls'],
  resources: [
    { extIdent: 'aed-polska-csv', format: 'csv', file: 'aed-polska.csv', title: 'Defibrylatory AED w Polsce — CSV', description: 'Plik CSV (UTF-8, separator przecinek). Opis kolumn w pliku ze wzorcowym zakresem danych.' },
    { extIdent: 'aed-polska-json', format: 'json', file: 'aed-polska.json', title: 'Defibrylatory AED w Polsce — JSON', description: 'Te same rekordy w formacie JSON, klucze zgodne z nazwami kolumn CSV.' },
  ],
} as const;

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dateTime = (d: Date) => d.toISOString().slice(0, 19);

/** XML for the dane.gov.pl harvester. `baseUrl` is where the module serves the generated resource files. */
export function datasetXml(baseUrl: string, lastUpdate: Date, dataDate: string): string {
  const m = AED_DATASET;
  const resources = m.resources.map(r => `
      <resource status="published">
        <extIdent>${r.extIdent}</extIdent>
        <url>${xml(`${baseUrl.replace(/\/$/, '')}/${r.file}`)}</url>
        <title><polish>${xml(r.title)}</polish></title>
        <description><polish>${xml(r.description)}</polish></description>
        <availability>local</availability>
        <dataDate>${dataDate}</dataDate>
        <lastUpdateDate>${dateTime(lastUpdate)}</lastUpdateDate>
        <hasDynamicData>false</hasDynamicData>
        <containsProtectedData>false</containsProtectedData>
      </resource>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:datasets xmlns:p="urn:otwarte-dane:harvester:1.13" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:otwarte-dane:harvester:1.13 https://dane.gov.pl/static/xml/otwarte_dane_latest.xsd">
  <dataset status="published">
    <extIdent>${m.extIdent}</extIdent>
    <title><polish>${xml(m.title.polish)}</polish><english>${xml(m.title.english)}</english></title>
    <description><polish>${xml(m.description.polish)}</polish><english>${xml(m.description.english)}</english></description>
    <url>${m.url}</url>
    <updateFrequency>${m.updateFrequency}</updateFrequency>
    <categories>${m.categories.map(c => `<category>${c}</category>`).join('')}</categories>
    <conditions>
      <source>true</source>
      <modification>true</modification>
      <dbOrCopyrighted>Zbiór stanowi bazę danych udostępnianą na licencji CC BY 4.0.</dbOrCopyrighted>
      <dbOrCopyrightedLicenseChosen>${m.license}</dbOrCopyrightedLicenseChosen>
    </conditions>
    <resources>${resources}
    </resources>
    <tags>${m.tags.map(t => `<tag lang="pl">${xml(t)}</tag>`).join('')}</tags>
    <lastUpdateDate>${dateTime(lastUpdate)}</lastUpdateDate>
    <hasDynamicData>false</hasDynamicData>
  </dataset>
</p:datasets>
`;
}
