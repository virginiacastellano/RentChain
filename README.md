<div align="center">

# 🏠 RentChain

**Alquileres sin inmobiliaria, con la garantía protegida en la blockchain**

[![Tests](https://github.com/virginiacastellano/RentChain/actions/workflows/tests.yml/badge.svg)](https://github.com/virginiacastellano/RentChain/actions/workflows/tests.yml)
![Estado](https://img.shields.io/badge/estado-v1_funcional-FF6AD5?style=flat-square)

![Solidity](https://img.shields.io/badge/Solidity-0.8.20-363636?style=flat-square&logo=solidity)
![Hardhat](https://img.shields.io/badge/Hardhat-FFF100?style=flat-square&logo=hardhat&logoColor=black)
![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-v5-4E5EE4?style=flat-square&logo=openzeppelin&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![ethers](https://img.shields.io/badge/ethers-v6-2535A0?style=flat-square)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)

</div>

![RentChain](docs/screenshots/inicio.jpg)

## 💡 Mi idea

Alquilar en Argentina es caro e injusto, sobre todo para el inquilino. Cuando alguien se muda tiene que pagar el último mes donde vivía, el depósito del nuevo alquiler, adelantos y además la comisión de la inmobiliaria. Encima, los contratos suelen redactarse a favor de quien los escribe.

Mi idea con RentChain es **sacar a la inmobiliaria del medio y que el contrato sea justo para las dos partes**:

- 🏡 Para **el dueño**, que pone en manos de un desconocido algo que le costó, que pinta y que cuida.
- 🔑 Para **el inquilino**, que hoy carga con casi todos los costos y con contratos que no negoció.

### Cómo lo imagino

1. 👤 **Cada parte tiene su usuario.** El dueño publica la propiedad con todas sus fotos y su estado.
2. 📸 **El inquilino visita el lugar y sube sus propias fotos.** Si lo que muestra el dueño y lo que ve el inquilino no coincide, queda registrado.
3. 📝 **El contrato lo construyen los dos.** El dueño propone una versión y el inquilino sugiere correcciones.
4. ⚖️ **Un escribano matriculado y anónimo revisa todo.** Compara las fotos, evalúa las discrepancias y aprueba el contrato con su criterio profesional. Ninguna de las partes sabe quién es, para que no haya presiones ni extorsiones. La plataforma sí lo conoce y valida que esté matriculado y habilitado; su identidad solo se revela si hay un problema legal.
5. ✍️ **Ambos firman el contrato por la web.** El documento queda en IPFS y su referencia queda sellada en la blockchain: nadie puede modificarlo después.
6. 💰 **Los montos, adelantos y la garantía se manejan con contratos inteligentes**, sin que nadie se quede con la plata en el bolsillo.

### Lo que todavía estoy pensando

- **Sin garantes.** Muchas veces el garante, cuando hay un problema, ya no tiene nada a su nombre y el trámite termina en abogados. Me gustaría reemplazarlo por un **fondo de garantía** o un **seguro de caución** integrado a la plataforma.
- **Qué pasa si el inquilino deja de responder.** Cómo retener parte de la garantía para cubrir gastos de forma justa, sin perjudicar a quien cumple.

### Qué está construido hoy (v1)

La v1 implementa el corazón del sistema, de punta a punta y con interfaz web:

- el **acuerdo** entre dueño, inquilino y escribano, creado en una sola transacción;
- la **garantía en un escrow**, que vuelve al inquilino salvo que el escribano decida otra cosa;
- una **dApp web** donde cada rol ve su estado, sus acciones y el historial on-chain del acuerdo.

Las fotos, la co-redacción del contrato, las firmas web y la subida a IPFS son los siguientes pasos (ver el roadmap).

## ⚙️ Cómo funciona

```mermaid
flowchart LR
    A[🏡 Propietario<br/>crea el acuerdo] --> B[🔑 Inquilino<br/>acepta]
    B --> C[⚖️ Escribano<br/>acepta]
    C --> D[Acuerdo activo]
    D --> E[💰 Inquilino deposita<br/>la garantía]
    E --> F{¿Hay conflicto?}
    F -- No --> G[La garantía vuelve<br/>al inquilino]
    F -- Sí --> H[El escribano decide<br/>cómo se reparte]
    H -. Si no responde en 30 días .-> G
```

1. El **propietario** crea el acuerdo con el inquilino, el árbitro, las fechas, el monto de la garantía y la huella del contrato firmado.
2. El **inquilino** y el **árbitro** aceptan participar, y el propietario activa el acuerdo.
3. El inquilino deposita la **garantía** en el escrow.
4. Al terminar el alquiler, el propietario la **devuelve**. Para quedarse con una parte, necesita la autorización del inquilino o abrir una disputa dentro de los **7 días** posteriores. Si no hace nada, el inquilino la recupera.
5. Si hay disputa, el **árbitro** decide: todo para una de las partes o un reparto (por ejemplo, una parte para el propietario por daños y el resto para el inquilino).
6. Si el árbitro no resuelve en **30 días**, la garantía vuelve al inquilino. **La plata nunca queda trabada.**

### Qué puede hacer cada rol

| Rol | Acciones |
|---|---|
| 🏡 **Propietario** | Crear el acuerdo · activarlo cuando todos aceptaron · cancelar el borrador · devolver la garantía · cobrarla solo si el inquilino lo autoriza · abrir disputa |
| 🔑 **Inquilino** | Aceptar el acuerdo · depositar la garantía · autorizar un cobro · abrir disputa · recuperar la garantía si el propietario no responde o si el árbitro no resuelve a tiempo |
| ⚖️ **Escribano / árbitro** | Aceptar participar · resolver la disputa: todo al propietario, todo al inquilino o un reparto |

![Disputa vista por el escribano](docs/screenshots/disputa-arbitro.jpg)

## 🏗️ Arquitectura

```mermaid
flowchart LR
    UI[Frontend React + ethers] -->|createAgreement| F[RentChainFactory]
    F -->|despliega| RC[RentContract<br/>acuerdo]
    F -->|despliega y vincula| RE[RentEscrow<br/>garantía ERC20]
    RE -->|lee estado y fechas| RC
    UI -->|aceptar / activar| RC
    UI -->|depositar / disputar / resolver| RE
    API[Backend FastAPI + PostgreSQL] -.->|próximo: sincronizar eventos| RC
```

## 📜 Contratos inteligentes

| Contrato | Responsabilidad |
|---|---|
| `RentContract.sol` | El **acuerdo**: participantes, fechas, documento, aceptaciones y estado (`Draft` → `Active` / `Cancelled`). Si cambia el documento, las aceptaciones se invalidan |
| `RentEscrow.sol` | El **dinero**: depósito de la garantía, devolución, disputas, reparto del árbitro y plazos |
| `RentChainFactory.sol` | Crea y **vincula** acuerdo + escrow en una sola transacción y mantiene el índice de acuerdos por participante |
| `MockUSDT.sol` | Token de prueba para el depósito |

Separé el acuerdo del dinero a propósito: cada contrato tiene una sola responsabilidad y es más fácil de auditar.

### 🔐 Decisiones de seguridad

- El escrow se **vincula una sola vez** a su acuerdo y verifica que ambos tengan las mismas personas.
- Solo se puede depositar con el acuerdo **activo**.
- El propietario **no puede llevarse la garantía por su cuenta**: necesita la autorización del inquilino o la decisión del árbitro.
- **Plazos para todo**, así ningún fondo queda bloqueado si alguien desaparece.
- Patrón **Checks-Effects-Interactions** y `SafeERC20` de OpenZeppelin en todas las transferencias.
- Se verifica que llegue el **monto exacto**, para que tokens con comisión no rompan la contabilidad.
- No hay funciones de administrador ni forma de sacar fondos por fuera de estas reglas.

## 🖥️ Frontend

dApp en **React + Vite + ethers v6**:

- **Modo demo por roles:** se cambia entre Propietario, Inquilino y Escribano con un clic, usando las cuentas locales de Hardhat. No hace falta instalar nada.
- Soporte para **MetaMask** en la red local.
- Línea de tiempo del acuerdo, acciones disponibles según el rol y el estado, y mensajes que explican qué falta.
- **Historial on-chain** de cada acuerdo a partir de los eventos de los contratos.
- Botón **⏩ Adelantar 30 días** (solo en local) para probar los plazos.
- El contrato firmado se identifica con su **huella SHA-256**, calculada en el navegador.

![Historial on-chain](docs/screenshots/historial.jpg)

## 🧩 Backend

API en **FastAPI** con PostgreSQL y SQLAlchemy 2.0, organizada en capas (`routes` → `services` → `repositories`):

- Registro de usuarios con wallet, login con **JWT** y contraseñas con **bcrypt**
- Recuperación de contraseña sin exponer el token y sin revelar qué emails están registrados
- Listado de usuarios solo para administradores
- Modelos para propiedades, acuerdos, participantes, disputas, evidencias y perfiles de árbitro
- Manejo de errores y logging centralizados

## 📁 Estructura

```
blockchain/   contratos, tests, scripts de deploy y demo (Hardhat)
frontend/     dApp en React + ethers
backend/      API en FastAPI
docs/         caso de uso, casos de uso del proyecto, roadmap y capturas
```

## ▶️ Cómo correrlo

**App completa en local** (Node 18+)

```bash
# terminal 1: blockchain local
cd blockchain
npm install
npx hardhat node

# terminal 2: deploy de contratos + configuración del frontend
cd blockchain
npm run deploy:local

# terminal 3: frontend
cd frontend
npm install
npm run dev               # http://localhost:5173
```

**Demo por consola** (no necesita nodo)

```bash
cd blockchain
npm run demo
```

Recorre tres escenarios: alquiler sin conflicto, disputa resuelta con reparto y acuerdo cancelado. También muestra cómo los contratos bloquean las acciones indebidas.

**Sepolia**

Definí como variables de entorno las de `blockchain/.env.example` y corré `npm run deploy:sepolia`. Si también definís `TENANT_ADDRESS` y `ARBITER_ADDRESS`, se crea un acuerdo de ejemplo.

**Backend** (Python 3.11+ y PostgreSQL)

```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1     # Windows (en Linux/Mac: source .venv/bin/activate)
pip install -r requirements.txt
cp .env.example .env           # completar DATABASE_URL y JWT_SECRET_KEY
uvicorn app.main:app --reload  # http://localhost:8000/docs
```

## 🧪 Tests

```bash
cd blockchain && npx hardhat test     # 47 tests de contratos
cd backend && python -m pytest        # 18 tests de backend
```

- **Contratos:** acuerdo, factory, depósito, devolución, autorización de cobro, disputas, repartos, plazos, tokens con comisión y control de acceso.
- **Backend:** seguridad, autenticación, recuperación de contraseña y permisos.

Corren automáticamente en GitHub Actions con cada cambio.

## ⚠️ Limitaciones conocidas de la v1

- **Documento:** se registra la huella SHA-256; la subida a IPFS es el próximo paso.
- **Escribano anónimo:** la app lo muestra como "identidad reservada", pero su wallet es pública on-chain. Una reserva real requiere una capa de privacidad, como direcciones efímeras o pruebas de conocimiento cero.
- **Elección del escribano:** hoy la hace el propietario y el inquilino la acepta. La asignación aleatoria entre escribanos verificados está en el roadmap.
- **Backend:** todavía no está integrado con la blockchain ni tiene endpoints de acuerdos y disputas (los modelos existen).

## 🗺️ Roadmap

- [x] Contratos de acuerdo y garantía con disputas y plazos
- [x] Factory de contratos: acuerdo + escrow en una transacción
- [x] Frontend con vistas por rol e historial on-chain
- [x] Backend base: usuarios, autenticación y modelos
- [x] Scripts de deploy (local y Sepolia) y demo
- [ ] Endpoints para propiedades, acuerdos y disputas
- [ ] Subida del contrato y de las fotos del dueño y del inquilino a IPFS, y comparación por el escribano
- [ ] Contrato co-redactado: propuesta del dueño y correcciones del inquilino
- [ ] Firma web de ambas partes y aprobación del escribano on-chain
- [ ] Validación de escribanos matriculados y asignación aleatoria (Chainlink VRF)
- [ ] Integración del backend con la blockchain (indexar eventos) y login con wallet (SIWE)
- [ ] Fondo de garantía o seguro de caución para reemplazar a los garantes
- [ ] Posibilidad de reemplazar al escribano

---

<div align="center">

Hecho con 💜 por [Virginia Castellano](https://github.com/virginiacastellano)

</div>
