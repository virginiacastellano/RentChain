# RentChain Use Case

## Vision del producto

RentChain v1 busca reemplazar el flujo tradicional de alquiler manejado por inmobiliarias
por un flujo directo entre partes, con respaldo legal y trazabilidad tecnica.

Los tres actores principales son:

- `landlord`: duenio o propietario del inmueble
- `tenant`: inquilino
- `arbiter`: escribano o tercero confiable verificado por la plataforma

## Principio de la version 1

La version 1 no usa una DAO de arbitraje.

En cambio, usa un modelo mas realista y cercano al proceso legal tradicional:

- el `landlord` inicia el acuerdo
- el `tenant` acepta participar
- un `arbiter` verificado por la plataforma participa como tercero confiable
- la identidad real del arbiter queda reservada frente a landlord y tenant durante la disputa
- la plataforma si conoce y valida internamente esa identidad

## Idea central

El propietario no depende de una inmobiliaria para iniciar el proceso.
En cambio:

1. crea el acuerdo en la app
2. selecciona o invita al inquilino
3. selecciona o invita a un escribano/arbitro verificado
4. sube el contrato firmado a IPFS
5. despliega o vincula el escrow on-chain
6. el inquilino deposita el dinero
7. si hay conflicto, el arbitro resuelve

Importante:

- landlord y tenant pueden conocerse entre si
- landlord y tenant no ven la identidad completa del arbiter durante la disputa
- la plataforma conserva la validacion real del arbiter para respaldo operativo y legal

## Flujo funcional deseado

### 1. Creacion del acuerdo

El landlord inicia el proceso.

Datos minimos:

- propiedad
- tenant
- arbiter
- fechas del alquiler
- hash IPFS del documento
- direccion del escrow

### 2. Aceptacion de participantes

Antes de activar el acuerdo:

- el tenant debe aceptar participar
- el arbiter debe aceptar actuar como tercero confiable

### 3. Activacion

Cuando tenant y arbiter aceptan:

- el landlord activa el acuerdo
- el acuerdo pasa de `Draft` a `Active`

### 4. Deposito

El tenant deposita el monto requerido en el contrato `RentEscrow`.

### 5. Resolucion normal

Si no hay conflicto:

- el landlord libera el deposito segun el flujo acordado

### 6. Disputa

Si surge un conflicto:

- landlord o tenant abren disputa
- los fondos quedan congelados
- el arbiter decide a quien se liberan

### 7. Evidencia

Durante una disputa, landlord y tenant deberian poder subir evidencia:

- fotos
- texto descriptivo
- documentos complementarios
- referencias externas

La plataforma organiza esa evidencia para que el arbiter tome una decision con trazabilidad.

## Separacion de responsabilidades en blockchain

### `RentEscrow.sol`

Se ocupa del dinero:

- token del deposito
- monto
- deposito
- disputa
- resolucion

### `RentContract.sol`

Se ocupa del acuerdo:

- participantes
- hash del documento
- fechas
- aceptaciones
- estado del acuerdo
- referencia al escrow

## Implicancia para backend

El backend debe reflejar esta logica.

El modelo mental recomendado es:

- `User`: usuario autenticado con wallet y tipo de perfil
- `ArbiterProfile`: verificacion interna del escribano/arbitro
- `Property`: inmueble del landlord
- `RentalAgreement`: acuerdo creado por el landlord
- `AgreementParticipant`: participantes y rol dentro del acuerdo
- `Dispute`: conflicto abierto sobre un escrow/acuerdo
- `DisputeEvidence`: pruebas subidas por las partes

Importante:

- un usuario puede existir en el sistema sin ser landlord en todos los casos
- el rol mas importante se define por acuerdo, no solo por perfil global
- la identidad del arbiter puede quedar reservada para las partes, pero no para la plataforma

## Implicancia para frontend

La interfaz debe hacer visible que:

- el landlord inicia el proceso
- el tenant acepta
- el arbiter valida y participa como tercero confiable
- la app evita la inmobiliaria, pero no elimina el respaldo legal
- la disputa admite evidencia y resolucion
- el arbiter aparece como verificado, pero con identidad reservada frente a landlord y tenant
