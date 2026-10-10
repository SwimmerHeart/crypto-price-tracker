# crypto-price-tracker

REST API для отслеживания и агрегации цен криптовалют через CoinMarketCap.
Авторизация по Bearer-ключу, фоновая синхронизация цен, история с метриками.

## Стек

- Node.js 22.5+ (встроенный `node:sqlite`), Express 5, TypeScript
- SQLite без ORM - только raw SQL
- Jest + Supertest, axios, Swagger/OpenAPI вручную

## Конфликт в задании (почему Node 22.5+, а не 18+ )

Задание требует SQLite при разрешённом списке библиотек, в котором нет драйвера.
Выбран встроенный `node:sqlite` - часть стандартной библиотеки Node.js, поэтому
новых зависимостей не добавляется. Цена - минимальная версия Node 22.5 вместо
заявленных 18+. Остальной код совместим с Node 18.

## Запуск

```bash
npm install
npm run build
npm start
```

Сервер поднимется на `http://localhost:3000`, документация — `http://localhost:3000/docs`.

### Окружение

Копия шаблона: `cp .env.example .env` и заполнить. Ключ CoinMarketCap получают на
<https://pro.coinmarketcap.com/signup> (Basic бесплатно).

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `PORT` | `3000` | Порт HTTP-сервера |
| `CMC_API_KEY` | — | Ключ CoinMarketCap (`X-CMC_PRO_API_KEY`) |
| `CMC_BASE_URL` | `https://pro-api.coinmarketcap.com` | Адрес CMC |
| `CMC_TIMEOUT_MS` | `10000` | Таймаут запроса к CMC |
| `CURRENCY` | `USD` | Единая валюта для всех цен |
| `SYNC_INTERVAL_MS` | `300000` | Интервал фоновой синхронизации (5 минут) |
| `DB_PATH` | `./app.db` | Файл базы данных |

### Получение ключа

```bash
curl -X POST http://localhost:3000/auth/register
# → {"apiKey":"<64 hex-символа>"}
```

Дальше ключ передаётся заголовком `Authorization: Bearer <apiKey>`.

## API

| Метод | Путь | Описание |
|---|---|---|
| GET | `/health` | Проверка состояния |
| POST | `/auth/register` | Новый API-ключ |
| GET | `/coins` | Список отслеживаемых монет |
| POST | `/coins` | Добавить монету (`{"symbol":"BTC"}`) |
| DELETE | `/coins/{symbol}` | Перестать отслеживать |
| GET | `/coins/{symbol}/price` | Текущая цена (из последней синхронизации) |
| GET | `/coins/{symbol}/history` | История цен + `count/min/max/avg` |

Полная спецификация — `public/openapi.yaml`, интерактивный просмотр — `/docs`
(Swagger UI с CDN, сам файл доступен офлайн).

## Как заполняется история

Историю накапливает фоновая задача: каждые `SYNC_INTERVAL_MS` все отслеживаемые
символы забираются **одним запросом** к CMC (бандл до 100 ресурсов стоит 1 кредит)
и пишутся в `price_history`. Для демонстрации поставьте `SYNC_INTERVAL_MS=60000`.
На свежей базе история пустая - это ожидаемо и честно: строки создаёт только
реальная работа сервиса, ничего не догружается задним числом.

## Тесты

```bash
npm test          # 16 сьютов (jest)
npm run typecheck # tsc --noEmit
```

Интеграционные тесты идут против настоящей SQLite во временном каталоге, внешний
API мокается на уровне клиента. Покрытие по правилу "минимум позитив + негатив на
эндпоинт".

## Структура

```
src/
  index.ts            точка входа, сборка, graceful shutdown
  app.ts              сборка express-приложения (DI)
  config/             окружение
  core/               ошибки, логгер, типы
  db/                 подключение, миграции, транзакции
  repositories/       только SQL, по таблице на репозиторий
  services/           бизнес-логика
  clients/            axios-клиент CoinMarketCap с retry
  jobs/               планировщик фоновой задачи
  middleware/         requestId, Bearer, обработчик ошибок
  routes/             HTTP-слой
public/               openapi.yaml + Swagger UI
docs/                 бриф, архитектура, решения, дейлики
```
