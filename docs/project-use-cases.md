# RentChain Project Use Cases

## Objetivo

Este documento resume los casos de uso principales de RentChain v1.

La logica de negocio actual de la version 1 es:

- el landlord lidera el proceso
- el tenant acepta participar
- el arbiter es un escribano o tercero confiable verificado por la plataforma
- la identidad del arbiter se mantiene reservada ante las partes durante una disputa
- el contrato legal y el escrow financiero se modelan por separado

## Actores

- `Landlord`
- `Tenant`
- `Arbiter`
- `Platform`

## Caso de uso 1: registro de usuario

### Actor principal

- usuario

### Flujo

1. el usuario se registra
2. vincula su wallet
3. queda habilitado para autenticarse

### Resultado

- usuario disponible en la plataforma

## Caso de uso 2: login y autenticacion

### Actor principal

- usuario registrado

### Flujo

1. ingresa email y password
2. la plataforma valida credenciales
3. emite JWT

### Resultado

- usuario autenticado

## Caso de uso 3: landlord crea un acuerdo

### Actor principal

- landlord

### Flujo

1. selecciona una propiedad
2. define tenant
3. define arbiter verificado
4. carga fechas del alquiler
5. sube documento y guarda hash IPFS
6. crea o vincula el escrow

### Resultado

- acuerdo creado en estado `draft`

## Caso de uso 4: tenant acepta el acuerdo

### Actor principal

- tenant

### Flujo

1. recibe invitacion al acuerdo
2. revisa participantes, fechas y documento
3. acepta participar

### Resultado

- acuerdo marca `tenantAccepted = true`

## Caso de uso 5: arbiter acepta el acuerdo

### Actor principal

- arbiter

### Flujo

1. recibe asignacion de acuerdo
2. confirma que acepta intervenir como tercero confiable

### Resultado

- acuerdo marca `arbiterAccepted = true`

## Caso de uso 6: landlord activa el acuerdo

### Actor principal

- landlord

### Precondiciones

- tenant acepto
- arbiter acepto

### Flujo

1. landlord activa el acuerdo

### Resultado

- estado del acuerdo pasa a `active`

## Caso de uso 7: tenant deposita el dinero en escrow

### Actor principal

- tenant

### Flujo

1. tenant recibe o posee fondos del token del deposito
2. hace `approve` al contrato escrow
3. llama `deposit()`

### Resultado

- el escrow retiene los fondos

## Caso de uso 8: resolucion normal sin disputa

### Actor principal

- landlord

### Precondiciones

- el tenant ya deposito
- no existe disputa

### Flujo

1. landlord libera el deposito segun el flujo normal

### Resultado

- los fondos salen del escrow

## Caso de uso 9: apertura de disputa

### Actor principal

- landlord o tenant

### Precondiciones

- existe deposito
- el escrow aun no fue resuelto

### Flujo

1. alguna de las partes abre disputa

### Resultado

- el escrow queda congelado

## Caso de uso 10: carga de evidencia

### Actor principal

- landlord o tenant

### Flujo

1. sube fotos, texto o archivos
2. la plataforma asocia esa evidencia al caso

### Resultado

- el arbiter dispone de material para resolver

## Caso de uso 11: resolucion por arbitro

### Actor principal

- arbiter

### Flujo

1. revisa evidencia
2. decide a favor de landlord o tenant
3. ejecuta la resolucion del escrow

### Resultado

- fondos liberados segun la decision arbitral

## Caso de uso 12: identidad reservada del arbitro

### Actor principal

- platform

### Flujo

1. valida internamente la identidad y credenciales del arbiter
2. asigna al arbiter a un acuerdo
3. muestra a las partes solo que el arbiter esta verificado

### Resultado

- landlord y tenant no acceden a la identidad completa del arbiter durante la disputa
- la plataforma mantiene trazabilidad interna del profesional asignado
