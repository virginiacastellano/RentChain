# RentChain — Estado del proyecto

Última actualización: 27/11/2026 · rama `feat/functional-completion`

> Los contratos **no tienen una auditoría profesional**. Todo lo marcado como verificado se probó con tests automáticos y en una blockchain local de Hardhat, sin fondos reales y sin despliegues en redes públicas.

## ✅ Completado y verificado

### Contratos (Solidity 0.8.20)

- [x] `RentChainFactory`: crea acuerdo + escrow vinculados en una sola transacción e indexa los acuerdos por participante.
- [x] `RentContract`: partes, fechas, huella del documento, aceptaciones y estados `Draft → Active / Cancelled`.
- [x] Validaciones al crear el acuerdo: wallets no vacías y distintas entre sí, monto > 0, fin > inicio, documento obligatorio.
- [x] Reemplazar el documento en borrador reinicia las aceptaciones.
- [x] `RentEscrow`: se vincula una sola vez al acuerdo y verifica que las partes coincidan.
- [x] El depósito solo es posible con el acuerdo activo y exige que llegue el monto exacto (rechaza tokens con comisión).
- [x] Devolución de la garantía por el propietario.
- [x] Cobro del propietario solo con autorización del inquilino.
- [x] Reclamo del inquilino si el propietario no actúa hasta 7 días después del fin del alquiler.
- [x] Disputa: el propietario puede abrirla hasta el fin del alquiler + 7 días; el inquilino, mientras haya fondos.
- [x] Resolución del árbitro: todo a una parte o reparto. Solo el árbitro puede resolver.
- [x] Timeout de 30 días del árbitro: la garantía vuelve al inquilino, así los fondos no quedan bloqueados.
- [x] Checks-effects-interactions, `SafeERC20` y `ReentrancyGuard` en todas las funciones que mueven fondos.
- [x] **59 tests**. Cubren permisos por rol, máquina de estados, doble ejecución, reentrancia (token que intenta reentrar), tokens con comisión, falta de allowance o saldo, y conservación de fondos (el escrow queda en 0 y las partes reciben exactamente el depósito).

### Frontend (React + ethers v6)

- [x] Creación de acuerdos con validación de wallets, montos, fechas y documento.
- [x] Consulta de acuerdos por participante, con el estado y los saldos reales leídos on-chain.
- [x] Aceptación de las partes y activación del acuerdo.
- [x] Depósito con aprobación de mUSDT. Si ya hay allowance, se salta la aprobación. Antes de firmar verifica el saldo.
- [x] Devolución, autorización de cobro, cobro, disputa, resolución (incluido el reparto) y reclamos por plazo vencido.
- [x] Solo se muestran las acciones permitidas para el rol y el estado.
- [x] Confirmación previa de las acciones que mueven fondos o son irreversibles.
- [x] Estados de transacción: firma en wallet → pendiente on-chain (con hash) → confirmado. Solo se informa éxito con recibo `status = 1`.
- [x] Errores del contrato traducidos a mensajes comprensibles.
- [x] Actualización en vivo con cada bloque nuevo, incluidas las transacciones hechas por fuera de la app.
- [x] Huella SHA-256 del PDF, verificación de una copia contra la huella on-chain y reemplazo en borrador.
- [x] Historial on-chain con hashes de transacción (enlace al explorador en Sepolia o mainnet; copiar en la red local).
- [x] Diseño responsive (probado a 375 px).
- [x] El modo demo se identifica como tal y el adelanto de tiempo solo existe en la red local, con confirmación.

### Backend (FastAPI)

- [x] Registro, login JWT, `/auth/me` y recuperación de contraseña sin exponer el token ni revelar qué emails existen.
- [x] `/users` solo para administradores.
- [x] 18 tests. Corren sin base de datos, igual que en el CI.

### Recorridos verificados en el navegador (blockchain local, 27/11/2026)

| # | Recorrido | Resultado |
|---|---|---|
| 1 | Formulario con wallet inválida, árbitro = propietario, monto 0, fin antes del inicio y sin documento | ✅ 5 errores, no se envía nada |
| 2 | Crear → verificar el PDF original (coincide) y uno alterado (no coincide) | ✅ |
| 3 | El inquilino acepta → el propietario reemplaza el documento → se reinicia la aceptación | ✅ |
| 4 | Aceptar → activar → depositar (2 firmas: approve + depósito) → el propietario devuelve | ✅ saldos 10.000 → 8.500 → 10.000; escrow 1.500 → 0 |
| 5 | Disputa del propietario → reparto inválido (2.500 de 2.000) rechazado → reparto 600/1.400 | ✅ propietario +600, inquilino +1.400 |
| 6 | El inquilino autoriza el cobro → el propietario cobra | ✅ |
| 7 | Depósito de 20.000 con saldo de 8.400 | ✅ aviso de saldo insuficiente, sin transacción |
| 8 | Adelantar 60 días → el propietario pierde la opción de disputa → el inquilino puede reclamar | ✅ |
| 9 | Carrera: con el diálogo "Devolver" abierto, el inquilino reclama por fuera de la app → el propietario confirma | ✅ la vista se actualiza sola; la transacción falla con "La garantía ya fue liberada" y no se mueven fondos |
| 10 | Timeout del árbitro (30 días) → el inquilino recupera | ✅ verificado en la sesión anterior y en tests |
| 11 | `npm run demo:local` contra el nodo | ✅ 3 escenarios |

## ⏳ Pendiente

- [ ] **IPFS**: hoy se registra solo la huella; el archivo no se sube. Hace falta elegir un proveedor (Pinata, web3.storage, nodo propio) y su credencial.
- [ ] **Backend ↔ blockchain**: endpoints de propiedades, acuerdos y disputas (los modelos existen), indexador de eventos y login con wallet (SIWE).
- [ ] **Evidencias de la disputa** (fotos, textos) para que el árbitro decida con trazabilidad.
- [ ] **Fotos de la propiedad** del dueño y del inquilino, y contrato co-redactado (visión del README).
- [ ] **Registro de escribanos verificados** y asignación aleatoria (Chainlink VRF).
- [ ] **Reemplazo del árbitro** si no acepta o deja de estar habilitado.
- [ ] Tests automáticos de la interfaz (Playwright). Hoy los recorridos se verificaron a mano en el navegador.
- [ ] El diálogo de confirmación no se cierra solo si el estado cambia mientras está abierto. El contrato igual rechaza la acción (recorrido 9).

## 🚫 Bloqueado (requiere decisión o acción de la dueña del proyecto)

- [ ] **Deploy en Sepolia**: el script está listo (`npm run deploy:sepolia`), pero necesita un RPC, una wallet de deploy con ETH de testnet y una autorización explícita. No se ejecutó.
- [ ] **Prueba con MetaMask real**: el código está, pero el navegador de pruebas no tiene la extensión. Falta probar firmar, rechazar una firma y cambiar de cuenta.
- [ ] **Mainnet**: fuera de alcance hasta tener una auditoría profesional.

## ❓ Reglas sin definir (no se improvisaron)

Estas decisiones afectan fondos o derechos de las partes. El contrato actual tiene el comportamiento indicado y conviene validarlo con la dueña del proyecto y un asesor legal:

1. **Plazos**: 7 días después del fin del alquiler para que el propietario devuelva o dispute, y 30 días para que el árbitro resuelva. Son constantes de la v1, no una regla legal.
2. **Qué pasa si el árbitro no resuelve**: hoy la garantía vuelve completa al inquilino.
3. **Activar o depositar después de la fecha de fin**: el contrato no lo impide. La app solo exige que el fin sea futuro al crear el acuerdo.
4. **Fecha de inicio en el pasado**: el contrato la permite.
5. **Autorización parcial de cobro**: hoy el inquilino solo puede autorizar el monto completo; un monto parcial requiere disputa.
6. **Pagos de alquiler mensuales y adelantos**: no están modelados; solo la garantía.
7. **Token real**: en local es `MockUSDT`. Falta elegir el stablecoin y la red de producción.
8. **Identidad reservada del escribano**: la app no la muestra, pero su wallet es pública on-chain. Una reserva real requiere otra solución técnica.

## 🔐 Riesgos y observaciones de seguridad

- **Modelo de confianza**: el árbitro decide sobre los fondos en disputa. Si se pone de acuerdo con una de las partes, puede favorecerla. El contrato limita el daño (no puede repartir más que el depósito y solo actúa en disputa), pero no lo evita.
- **Tiempo de bloque**: los plazos usan `block.timestamp` (variación de segundos, irrelevante frente a días).
- **Tokens no estándar**: los tokens con comisión se rechazan. Los tokens con rebase o con listas negras (como USDC) podrían bloquear una transferencia a una wallet bloqueada; está documentado, no mitigado.
- **Modo demo**: firma con cuentas desbloqueadas del nodo local. Solo existe si `deployment.json` trae cuentas demo y un RPC local; en una red pública la app pide MetaMask.
- **Claves**: no hay claves privadas en el código, el frontend ni Git. `.env` y `deployment.json` están en `.gitignore`. Las cuentas de Hardhat del README son públicas por diseño.
