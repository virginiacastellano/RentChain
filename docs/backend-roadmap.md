# RentChain Backend Roadmap

## Estado actual

El backend ya tiene una base funcional y profesional inicial, pero ahora la vision del
producto se ajusta a un flujo liderado por el landlord.

### Lo que ya funciona

- FastAPI levantando con `uvicorn`
- Configuracion centralizada con `.env` y `app/core/config.py`
- Logging base en `app/core/logging.py`
- PostgreSQL conectado con SQLAlchemy 2.0
- Modelo `User` persistido en la tabla `users`
- Sesion por request con `get_db()`
- Registro de usuarios con `POST /users`
- Login con JWT en `POST /auth/login`
- Ruta protegida `GET /auth/me`
- Hash de contrasenas con `bcrypt`
- Separacion inicial en `routes`, `services` y `repositories`
- Validacion de email y wallet unica antes de guardar
- Flujo inicial de recuperacion de contrasena
- Tests base de seguridad, auth y endpoints

## Nueva vision funcional

RentChain no se piensa como una inmobiliaria digital, sino como una plataforma donde:

- el `landlord` inicia el acuerdo
- el `tenant` acepta participar
- el `arbiter` actua como escribano o tercero confiable verificado
- el acuerdo legal/comercial y el deposito quedan separados
- la identidad del arbiter queda reservada frente a landlord y tenant durante la disputa
- la plataforma valida internamente al arbiter y conserva su identidad real

### Separacion de responsabilidades

- `RentContract.sol` representa el acuerdo y sus participantes
- `RentEscrow.sol` representa el dinero y su resolucion
- el backend debe reflejar esa misma separacion

## Estructura actual del backend

```text
backend/
  .venv/                      # Entorno virtual de Python
  .env                        # Variables de entorno locales
  requirements.txt            # Dependencias Python del backend
  app/
    main.py                   # Punto de entrada FastAPI
    api/
      deps.py                 # Dependencias reutilizables (DB, auth)
      routes/
        auth.py               # Login y usuario autenticado
        health.py             # Health check
        users.py              # Endpoints de usuario
    core/
      config.py               # Configuracion global
      logging.py              # Logging base
      security.py             # Hash, verificacion y JWT
    db/
      base.py                 # Base declarativa SQLAlchemy
      session.py              # Engine y SessionLocal
    models/
      user.py                 # Modelo ORM User
    repositories/
      user_repository.py      # Consultas y persistencia de usuarios
    schemas/
      auth.py                 # Schemas de token
      user.py                 # Schemas de entrada y salida de usuario
    services/
      auth_service.py         # Logica de login
      user_service.py         # Logica de registro y validaciones
    tests/
      __init__.py             # Base para futuras pruebas
```

## Proximo bloque de trabajo

Ahora que la base tecnica ya existe, el backend deberia evolucionar hacia este dominio:

1. Modelar acuerdos creados por el landlord
2. Modelar participantes por acuerdo (`landlord`, `tenant`, `arbiter`)
3. Registrar aceptaciones del tenant y del arbiter
4. Asociar `Property`, `RentalAgreement` y `Dispute`
5. Modelar evidencia de disputa
6. Reflejar el estado del acuerdo (`draft`, `active`, `cancelled`)
7. Integrar referencias a `escrow_contract_address` e `ipfs_document_hash`
8. Seguir mejorando errores, validaciones y tests

## Objetivo de cada etapa

### 1. Acuerdo liderado por landlord

El backend debe permitir que el landlord:

- cree el acuerdo
- asigne tenant
- asigne arbiter
- suba o vincule el hash del documento
- vincule el escrow desplegado

### 2. Participantes por acuerdo

No alcanza con un rol global en `User`.
Tambien hace falta guardar el rol que un usuario ocupa dentro de cada acuerdo.

Ejemplo:

- `landlord`
- `tenant`
- `arbiter`

Ademas, el `arbiter` necesita una capa extra de verificacion interna.

### 3. Aceptaciones

Antes de activar un acuerdo:

- el tenant debe aceptar
- el arbiter debe aceptar

Esto tiene que reflejarse tanto en backend como en frontend.

### 4. Estados del acuerdo

El modelo de dominio debe contemplar estados como:

- `draft`
- `active`
- `cancelled`
- luego, eventualmente, `completed`

### 5. Respuestas de error consistentes

La idea sigue siendo estandarizar errores con una estructura clara, por ejemplo:

```json
{
  "detail": "Wallet address already registered",
  "error_code": "wallet_already_registered"
}
```

### 6. Documentacion OpenAPI

Cada endpoint importante deberia documentar:

- 200 o 201 cuando todo sale bien
- 400 para validaciones de negocio
- 401 para autenticacion fallida
- 404 cuando no existe el recurso
- 422 para errores de validacion de request

### 7. Validaciones extra

Ejemplos a cubrir:

- password demasiado corta
- nueva password igual a la anterior
- wallet vacia o con formato no valido
- email con espacios o casing inconsistente
- landlord y tenant iguales en un acuerdo
- arbiter no verificado
- activacion de acuerdo sin aceptaciones previas
- carga de evidencia sin disputa activa
- decision arbitral por usuario no autorizado

### 8. Tests

Primero vamos a cubrir:

- registro exitoso
- login y auth
- flujo forgot/reset password
- creacion de acuerdo por landlord
- aceptacion de tenant
- aceptacion de arbiter
- activacion solo cuando todos aceptaron
- manejo de disputas asociado al acuerdo
- carga de evidencia
- proteccion de identidad reservada del arbiter a nivel de API

## Decisiones importantes que ya tomamos

- Blockchain sera una feature del sistema, no el core del backend
- El backend principal se construye con FastAPI, no con Django
- Celery no entra al inicio; primero vamos con base solida y luego background tasks
- La observabilidad y el manejo de errores tienen que estar desde temprano
- El flujo del producto esta liderado por el landlord, no por una inmobiliaria
- El arbiter representa a un escribano o tercero confiable verificado
- La identidad del arbiter debe quedar reservada frente a las partes durante la disputa
- El acuerdo legal y el escrow financiero deben vivir separados

## Lo que viene despues de este bloque

Una vez que backend refleje bien esta vision:

1. integrarlo con `RentContract.sol`
2. integrarlo con `RentEscrow.sol`
3. guardar `escrow_contract_address` y `ipfs_document_hash`
4. sincronizar eventos on-chain con el estado local
5. recien despues construir la interfaz final de landlord, tenant y arbiter
