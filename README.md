# Mapa AED — Hacknation 2026

Frontend modułu AED na bazie portalu [dane.gov.pl](https://dane.gov.pl). Lokalnie działa jako SPA (`/pl/aed/...`) z proxy do lokalnego API.

## Repozytoria

| Część | Repo |
|---|---|
| Frontend (to repo) | https://github.com/jakubGora/aed-hacknation-2026 |
| Backend | https://github.com/ArkadiuszGrzyb/otwarte-dane-aed |

## Wymagania

- Node.js ≥ 20, npm ≥ 8
- Docker + Docker Compose (backend)
- klon BE obok FE albo w dowolnej ścieżce (port API: **8008**)

## 1. Backend

```bash
git clone https://github.com/ArkadiuszGrzyb/otwarte-dane-aed.git
cd otwarte-dane-aed
cp env.sample .env   # jeśli jeszcze nie ma .env
docker compose -f docker-compose.local.yml up -d
```

API: `http://127.0.0.1:8008`  
Przykład: `GET http://127.0.0.1:8008/aed/devices`

### Konto lokalne (panel dysponenta)

| | |
|---|---|
| e-mail | `aed@mcod.local` |
| hasło | `AedHack2026!` |

Jeśli użytkownika nie ma w bazie:

```bash
docker compose -f docker-compose.local.yml exec -T mcod-local-api python <<'PY'
import django
django.setup()
from django.utils import timezone
from mcod.users.models import User
email, password = 'aed@mcod.local', 'AedHack2026!'
u, _ = User.objects.get_or_create(email=email, defaults={'is_active': True, 'is_staff': True})
u.is_active = True
u.state = 'active'
u.email_confirmed = timezone.now()
u.set_password(password)
u.save()
print('ok', email)
PY
```

## 2. Frontend

```bash
git clone https://github.com/jakubGora/aed-hacknation-2026.git
cd aed-hacknation-2026
npm install
npm run start:aed
```

Aplikacja: **http://127.0.0.1:4310/pl/aed/mapa**

`start:aed` odpala konfigurację `aed` i proxy z `proxy.aed-local.conf.js`:

- `/api/aed/*` → lokalne API AED (`:8008`)
- `/api/auth/*` i reszta `/api/*` → to samo API (logowanie jak w mcod)

Konfiguracja runtime: `src/assets/aed/runtime-config.json`

```json
{ "demo": false, "apiUrl": "/api/aed" }
```

`demo: true` przełącza na dane w `localStorage` (bez BE).

## Główne ścieżki

| URL | Opis |
|---|---|
| `/pl/aed/mapa` | mapa i lista AED |
| `/pl/aed/dolacz` | zgłoszenie organizacji (gdy niezalogowany) |
| `/pl/aed/panel` | urządzenia dysponenta (po zalogowaniu) |
| `/pl/aed/import` | import CSV / XLSX |
| `/pl/user/login` | logowanie |

Niezalogowany widzi **Zgłoś AED**. Po zalogowaniu — **Moje urządzenia**.

## Import

Szablony i plik testowy (kolumny 1:1 z modelem dysponenta):

- `src/assets/aed/import-test.xlsx` / `.csv`
- `src/assets/aed/szablon-aed.xlsx` / `.csv`

Opis pól: [`aed-struktura-danych.md`](./aed-struktura-danych.md)

## Build / Vercel

```bash
npm run build:aed-public
```

Wyjście: `dist/aed/browser` (patrz `vercel.json`).

## Szybki check

1. BE: `curl -s http://127.0.0.1:8008/aed/devices | head`
2. FE: otwórz mapę, widać urządzenia
3. Zaloguj się kontem powyżej → pojawia się panel
