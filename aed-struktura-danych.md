# Struktura danych AED

Jeden wspólny zbiór, jeden wydawca. Wiele organizacji dopisuje tylko swoje wiersze. Wiersz publikowany to 24 kolumny poniżej. `status`, `revision` i `history` zostają w module i nie wchodzą do pliku zbioru.

Numer seryjny jednoznacznie identyfikuje fizyczne urządzenie. Ten sam numer nie może wystąpić drugi raz w całym zbiorze, także u innego dysponenta.

## dysponent

| pole | typ | opis |
|---|---|---|
| regon | tekst, 9 albo 14 cyfr, unikalny | identyfikator organizacji |
| nazwa | tekst | nazwa organizacji |
| portal_institution_id | tekst albo puste | identyfikator instytucji w dane.gov.pl, jeśli już istnieje |

Do dysponenta przypisani są użytkownicy portalu, którzy mogą edytować tylko jego wiersze.

## aed

| pole | typ | skąd | wymagane |
|---|---|---|---|
| id_aed | tekst, unikalny | system, `AED-{regon}-{0001}` | tak |
| numer_seryjny | tekst, 3–64 znaki, unikalny w całym zbiorze | dysponent, numer z obudowy | tak |
| id_zrodlowe | tekst | dysponent | nie |
| regon_dysponenta | tekst | system, z zalogowanego dysponenta | tak |
| nazwa_dysponenta | tekst | system | tak |
| nazwa_miejsca | tekst | dysponent | tak |
| teryt_gminy | tekst, 7 cyfr | dysponent | tak |
| miejscowosc | tekst | dysponent | tak |
| ulica | tekst | dysponent | nie |
| numer_budynku | tekst | dysponent | tak |
| kod_pocztowy | tekst `00-000` | dysponent | tak |
| szerokosc_geograficzna | liczba, WGS84 | dysponent | tak |
| dlugosc_geograficzna | liczba, WGS84 | dysponent | tak |
| opis_lokalizacji | tekst | dysponent | tak |
| dostepnosc | `calodobowa` \| `w_godzinach` \| `ograniczona` \| `nieznana` | dysponent | tak |
| godziny_dostepnosci | tekst, format opening_hours | dysponent | gdy dostępność to `w_godzinach` |
| uwagi_dostepu | tekst | dysponent | gdy dostępność to `ograniczona` |
| stan_urzadzenia | `sprawne` \| `niesprawne` \| `nieznany` | dysponent | tak |
| data_waznosci_baterii | data `RRRR-MM-DD` | dysponent | tak |
| data_waznosci_elektrod | data `RRRR-MM-DD` | dysponent | tak |
| data_przegladu | data `RRRR-MM-DD` | dysponent | nie |
| data_weryfikacji | data `RRRR-MM-DD` | dysponent | tak |
| zrodlo_danych | `formularz` \| `import_csv` \| `zbior_dostawcy` | system | tak |
| data_aktualizacji | data i czas ISO 8601 | system | tak |
| status | `draft` \| `published` | system | tak, tylko w module |
| revision | liczba | system, rośnie przy każdym zapisie | tak, tylko w module |
| history | lista `{ at, action }` | system | tylko w module |

Do publicznego zbioru trafiają wyłącznie wiersze ze statusem `published`. Szkic może być niekompletny. Publikacja wymaga pól oznaczonych jako wymagane.
