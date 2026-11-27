# Backend Notes

Este backend corre dentro de la carpeta `backend/`.

## Regla practica

Cuando trabajes con FastAPI, Python, `pip`, `pytest` o `uvicorn`, la terminal tiene que estar ubicada en:

```powershell
C:\Users\Virginia\Documents\Playground\RentChain\backend
```

Y el entorno virtual activo tiene que ser:

```text
backend\.venv
```

## Comandos base

Activar entorno virtual:

```powershell
.\.venv\Scripts\Activate.ps1
```

Levantar la API:

```powershell
uvicorn app.main:app --reload
```

Guardar dependencias:

```powershell
pip freeze > requirements.txt
```

## Recordatorio de arquitectura

- `api/` recibe HTTP
- `services/` resuelve logica de negocio
- `repositories/` habla con la base de datos
- `schemas/` usa Pydantic para requests y responses
- `models/` usa SQLAlchemy para tablas reales

## Vision de producto que debe reflejar el backend

RentChain no esta pensado como una inmobiliaria digital.
La logica objetivo es:

- el `landlord` inicia el acuerdo
- el `tenant` acepta participar
- el `arbiter` actua como escribano o tercero confiable verificado
- el contrato legal/comercial se separa del escrow financiero
- la identidad del `arbiter` queda reservada frente a landlord y tenant durante la disputa

## Impacto esperado en el backend

El backend va a necesitar modelar:

- `Property`
- `RentalAgreement`
- `ArbiterProfile`
- participantes por acuerdo
- aceptaciones de `tenant` y `arbiter`
- `ipfs_document_hash`
- `escrow_contract_address`
- estados del acuerdo (`draft`, `active`, `cancelled`)
- `DisputeEvidence`

## Idea importante

Un usuario puede existir en la app sin quedar atado a un solo rol global.
El rol mas importante se define dentro de cada acuerdo:

- landlord
- tenant
- arbiter

En el caso del `arbiter`, la plataforma si necesita conocer la identidad real para validar
credenciales, pero esa identidad no tiene por que exponerse a las partes durante una disputa.
