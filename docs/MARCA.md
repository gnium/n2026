# Doy Fe — guía de marca

Guía corta para quien escribe, diseña o publica en nombre de Doy Fe. Si algo no está acá, la regla es: sobrio, claro y verificable.
Los tokens de la interfaz viven en `frontend/src/styles.css`; esta guía no los reemplaza, los explica.

---

## 1. Plataforma de marca

**Propósito.** Que la escribanía trabaje con herramientas actuales sin resignar el secreto profesional.

**Promesa.** Doy Fe prepara, ordena y lleva la cuenta; la escribana o el escribano revisa y firma. Los datos de sus requirentes no salen de su escribanía sin anonimizar.

**El nombre.** "Doy fe" es la fórmula con la que el escribano da fe pública. La marca no se apropia de ese acto: lo acompaña. Por eso la voz nunca dice que el sistema "da fe" ni "certifica".

**Personalidad**

| Rasgo | Es | No es |
|---|---|---|
| Reservada | Discreta con los datos; explica qué se guarda y dónde | Misteriosa ni alarmista con la seguridad |
| Precisa | Usa el vocabulario notarial correcto; cifras y plazos exactos | Técnica por lucirse; jerga de software |
| Colega | Habla de igual a igual, con respeto por el oficio | Condescendiente, "amigable" forzada, tuteo de app |
| Confiable | Dice lo que hace y lo que no hace; admite límites | Grandilocuente; promete automatizar el criterio profesional |

**Posicionamiento.** Para escribanías argentinas que quieren sumar IA sin exponer a sus requirentes, Doy Fe es la plataforma de gestión notarial que anonimiza antes de procesar: la misma ayuda que ofrecen los sistemas notariales establecidos, con la privacidad como punto de partida y no como opción.

> Frente a la competencia hablamos de lo nuestro (privacidad, anonimización, revisión profesional). No se nombra a otros productos en piezas públicas ni se los descalifica.

---

## 2. Voz y tono

**Voz (constante):** sobria, de colega a colega, en español rioplatense profesional. Se usa "usted" en comunicaciones formales y el "vos" solo en redes si el contexto lo pide; nunca se mezclan en la misma pieza.

**Tono (varía según el momento):**

- **Interfaz:** breve y operativo. Verbo + objeto. "Guardar minuta", "Emitir comprobante".
- **Errores:** qué pasó, qué hacer, sin culpa. "No pudimos conectar con ARCA. Reintente en unos minutos; el comprobante quedó en borrador."
- **Privacidad y seguridad:** concreto y verificable, sin superlativos.
- **Comercial:** sereno; el beneficio, no el adjetivo.

**Correcto / incorrecto**

| Correcto | Incorrecto |
|---|---|
| Minuta lista para revisar | Escritura automática / escritura generada por IA |
| Los nombres y DNI se anonimizan antes de enviar el texto al modelo | Sus datos están 100 % seguros |
| Borrador sugerido; la revisión es suya | La IA redacta por usted |
| Protocolo, requirente, otorgante, UIF, ARCA | Clientes, usuarios finales, "el SAT de la escribanía" |
| No se guardan copias fuera de su cuenta | Seguridad de nivel militar / blindado |
| Comprobante emitido. CAE 7412… | ¡Listo! ¡Tu factura ya salió! |
| Integración con Google Calendar y Drive | Revolucionamos la escribanía |

**Reglas de escritura**

- Sin emojis, sin signos de exclamación en la interfaz, sin mayúsculas sostenidas para énfasis.
- Números con espacio antes de %: "21 %". Montos: "$ 1.250.000,00".
- Fechas: "12 de septiembre de 2026" en texto; "12/09/2026" en tablas.
- Nunca "garantizado", "infalible", "100 % seguro", "cero riesgo".
- La IA es una herramienta: "sugerencia", "borrador", "propuesta". El sujeto que decide es siempre el profesional.

---

## 3. Nombre

- En texto corrido: **Doy Fe** — dos palabras, D y F mayúsculas.
- Nunca: DOYFE, Doyfe, DoyFe, doy fe (en minúscula como marca), Doy-Fe.
- En mayúsculas sostenidas solo si la pieza entera va en versalitas por diseño (no en texto de interfaz).
- `doyfe` en minúscula y junto **solo** en identificadores técnicos:
  - Dominios: `doyfe.ar` (y `doyfe.com.ar` como redirección)
  - Instagram, TikTok, Facebook: `@doyfe.ar`
  - LinkedIn: `linkedin.com/company/doyfe-ar`
  - X: `@doyfe_ar`
- Identificadores internos heredados (`notarius` en base de datos, cookie, repo, paquetes) no se renombran y no aparecen ante el usuario.

---

## 4. Logo

El logo combina el **isotipo** y el **wordmark** "Doy Fe" en Source Serif 4 semibold.

**Construcción del isotipo (v2)** sobre una grilla de 120 × 120. Es un sello notarial reducido a lo esencial:

- **Anillo abierto:** radio 43, trazo 8, extremos redondeados y una apertura de 52° abajo. Es el sello.
- **La "D":** de Source Serif 4 semibold, la misma letra del wordmark, con altura de mayúscula 42.
- **Punto dorado:** radio 7, centrado en la apertura. Cierra el círculo: el acto se completa cuando el escribano da fe. Sobre azul se usa `#c9a45c`; sobre claro, `#9a7b3f`. En la versión monocroma toma el color del resto.

La v2 reemplazó a una v1 con 72 marcas finas en el anillo. Por debajo de 40 px esas marcas se empastaban y el conjunto se leía como la esfera de un reloj. La v2 tiene tres elementos y se lee hasta 24 px.

Los contornos están convertidos a trazos: ningún SVG depende de fuentes instaladas.

**Versiones**

| Versión | Uso | Archivo |
|---|---|---|
| Isotipo (app) | Íconos de app, avatares, espacios cuadrados | `frontend/public/logo/doyfe-isotipo.svg` (sello sobre cuadrado redondeado azul) |
| Sello | Sobre fondos claros, junto a texto | `frontend/public/logo/doyfe-sello.svg` (azul, sin fondo) |
| Horizontal | Encabezado de la app, landing, firma de correo, documentos | `frontend/public/logo/doyfe-horizontal.svg` |
| Vertical | Portadas, piezas cuadradas, presentaciones | `frontend/public/logo/doyfe-vertical.svg` |
| Monocromo | Impresión en un color, sello de goma, fax | `frontend/public/logo/doyfe-mono.svg` (usa `currentColor`: insertado en línea toma el color del texto; como `<img>` sale negro) |
| Invertido | Sobre azul pizarra o tinta (tema oscuro, pies de página) | `frontend/public/logo/doyfe-horizontal-invertido.svg` |
| PNG 120×120 | Pantalla de consentimiento de Google | `frontend/public/logo/doyfe-google-120.png` |
| PNG 512×512 | Avatares de redes, PWA, tiendas | `frontend/public/logo/doyfe-512.png` |
| Favicon / marca chica | Pestaña del navegador, barra lateral de la app (34 px) | `frontend/public/favicon.svg` (solo la "D" sobre azul) |
| Apple touch icon | Acceso directo en iOS | `frontend/public/apple-touch-icon.png` (180 × 180) |

**Área de resguardo.** Alrededor del logo, en todas las versiones, se deja libre un margen igual a **0,25 × el diámetro del isotipo**. Nada (texto, bordes, otras marcas) entra en ese margen.

**Tamaños mínimos**

- Isotipo completo: 24 px (pantalla) / 8 mm (impresión).
- Por debajo de 24 px se usa la marca chica (`favicon.svg`, la "D" sola), legible hasta 16 px.
- Horizontal: 96 px de ancho (pantalla) / 25 mm (impresión).

**Colores del logo.** Azul pizarra `#24466b` sobre claro; blanco `#ffffff` o papel `#f3f4f1` sobre azul o tinta; tinta `#1b1f24` en monocromo. El dorado `#9a7b3f` solo como detalle (por ejemplo, un filete en piezas impresas), nunca como color del logo completo.

**Usos incorrectos**

- No rotar, inclinar ni deformar (estirar o comprimir).
- No aplicar gradientes, sombras, brillos, biseles ni efectos 3D.
- No cambiar la tipografía del wordmark ni su peso.
- No usar el dorado como color principal del logo.
- No recolorear con colores fuera de la paleta ni usar el azul sobre fondos que no den contraste (ver sección 5).
- No encerrar el logo en cajas o formas adicionales, ni recortar el anillo del sello.
- No reordenar isotipo y wordmark ni cambiar su proporción.
- No colocar sobre fotos con ruido sin usar la versión monocroma o invertida sobre un plano sólido.

---

## 5. Color

**Paleta**

| Nombre | Hex | RGB | Uso |
|---|---|---|---|
| Azul pizarra | `#24466b` | 36, 70, 107 | Color de marca, acento, botones primarios, logo |
| Azul pizarra oscuro | `#1c3856` | 28, 56, 86 | Hover y estados presionados |
| Azul suave | `#e6edf5` | 230, 237, 245 | Fondos de selección, chips |
| Papel | `#f3f4f1` | 243, 244, 241 | Fondo general (tema claro) |
| Blanco | `#ffffff` | 255, 255, 255 | Superficies, tarjetas |
| Tinta | `#1b1f24` | 27, 31, 36 | Texto principal |
| Tinta secundaria | `#566069` | 86, 96, 105 | Texto secundario |
| Dorado de sello | `#9a7b3f` | 154, 123, 63 | Solo detalles: filetes, sellos, íconos decorativos |
| Noche (oscuro) | `#14171a` | 20, 23, 26 | Fondo general (tema oscuro) |
| Azul claro (oscuro) | `#7ea6d0` | 126, 166, 208 | Acento de marca en tema oscuro (token `--accent` del tema oscuro) |

Proporción orientativa por pantalla: papel y blanco dominan, tinta para texto, azul en acciones y marca, dorado casi ausente.

**Contraste WCAG 2.x** (calculado con la fórmula de luminancia relativa; AA texto normal ≥ 4,5, texto grande y elementos gráficos ≥ 3, AAA ≥ 7)

| Primer plano | Fondo | Relación | Resultado |
|---|---|---|---|
| `#24466b` | `#ffffff` | 9,71 : 1 | AAA |
| `#24466b` | `#f3f4f1` | 8,79 : 1 | AAA |
| `#ffffff` | `#24466b` | 9,71 : 1 | AAA |
| `#f3f4f1` | `#24466b` | 8,79 : 1 | AAA |
| `#1b1f24` | `#f3f4f1` | 15,00 : 1 | AAA |
| `#566069` | `#ffffff` | 6,42 : 1 | AA |
| `#9a7b3f` | `#ffffff` | 3,98 : 1 | Solo texto grande / gráficos. No apto para texto normal |
| `#9a7b3f` | `#f3f4f1` | 3,60 : 1 | Solo texto grande / gráficos |
| `#9a7b3f` | `#24466b` | 2,44 : 1 | No cumple. No usar dorado sobre azul para información |
| `#7ea6d0` | `#14171a` | 7,07 : 1 | AAA |
| `#24466b` | `#14171a` | 1,85 : 1 | No cumple. En tema oscuro el logo va invertido |


---

## 6. Tipografía

| Rol | Familia | Pesos | Uso |
|---|---|---|---|
| Wordmark y títulos editoriales | Source Serif 4 | 600 (semibold); 400 para citas | Logo, titulares de landing, encabezados de documentos |
| Interfaz | IBM Plex Sans | 400, 500, 600 | Toda la app, formularios, tablas, correos |
| Documentos | Source Serif 4 | 400 / 600 | Vista de minutas, .docx, textos notariales |
| Datos técnicos | Monoespaciada del sistema | 400 | CAE, CUIT en tablas, códigos |

- Fallbacks: `"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` y `"Source Serif 4", Georgia, "Times New Roman", serif`.
- Escala de la app (tokens `--t-*`): 12 / 14 / 16 / 18 / 22 / 28 px. Texto base 16 px; nada por debajo de 12 px.
- Títulos en oración ("Nueva minuta"), no en Tipo Título. Sin cursivas para énfasis en la interfaz; se usa peso 600.
- Interlineado: 1,5 en cuerpo, 1,25 en títulos. Largo de línea en textos: 60–75 caracteres.
- Carga web: Google Fonts con `display=swap` (ver `frontend/index.html`). En correos, solo fallbacks del sistema.

---

## 7. Iconografía

- Estilo único: **monocromo de trazo**, grilla 24×24, trazo 1,75, extremos y uniones redondeados, sin relleno. Referencia: `frontend/src/components/Iconos.jsx`.
- Color: `currentColor` (heredan el color del texto). Nunca multicolor, nunca con gradientes ni fondos ilustrados.
- Tamaños: 16 px en línea con texto, 20 px en botones y navegación, 24 px en encabezados de sección.
- Metáforas del oficio antes que las genéricas: `protocolo`, `sello`, `firma`, `pluma`, `recibo`.
- Un ícono nunca reemplaza una etiqueta en acciones críticas (emitir, firmar, borrar); va acompañado de texto o de `aria-label`.
- No usar el isotipo como ícono de interfaz ni íconos de terceros con otro estilo. Logos de terceros (Google, ARCA) solo en integraciones, según sus propias guías.

---

## 8. Aplicaciones

### Pantalla de consentimiento OAuth de Google

| Campo | Valor |
|---|---|
| Nombre de la aplicación | Doy Fe (con espacio y mayúsculas; no "doyfe") |
| Correo de asistencia | Google solo ofrece la cuenta propia o un grupo de Google que administres. Hoy: `sebastian@cumbre.tech`. Cuando exista, un grupo `soporte@doyfe.ar` |
| Logotipo | `doyfe-google-120.png`: 120 × 120 px, PNG, 10 KB, cuadrado a sangre en azul pizarra con el sello blanco, sin transparencia. Todo el dibujo entra en el círculo inscripto, así que resiste el recorte circular de Google |
| Página principal | `https://doyfe.ar/inicio.html` |
| Política de privacidad | `https://doyfe.ar/privacidad.html` |
| Condiciones del servicio | `https://doyfe.ar/condiciones.html` |
| Dominios autorizados | `doyfe.ar` |
| Contacto del desarrollador | Casilla técnica en `doyfe.ar` |

Las tres páginas deben estar publicadas, accesibles sin sesión y mostrar el nombre "Doy Fe" igual que en la pantalla de consentimiento, o Google rechaza la verificación. Cambiar el logo reinicia la revisión: definirlo antes de enviarla.

### Avatares de redes

- Usar el **isotipo invertido (blanco o papel) sobre azul pizarra `#24466b`**, en `doyfe-512.png` o mayor.
- Diseñar para **recorte circular**: el isotipo ocupa como máximo el 70 % del diámetro, centrado, para que el anillo no toque el borde.
- Sin texto en el avatar; el nombre lo pone la red. Mismo avatar en todas las cuentas.
- Nombre visible: "Doy Fe". Bio de referencia: "Gestión notarial con IA y privacidad. Minutas listas para revisar, protocolo, caja y UIF."
- Portadas (LinkedIn, X): fondo papel o azul liso, wordmark horizontal y una frase; sin fotos de stock ni mockups con brillos.

### Firma de correo

```
Nombre Apellido
Cargo · Doy Fe
doyfe.ar
```

- Logo horizontal en PNG a 2× (mostrado a 120 px de ancho), alojado en `doyfe.ar`; si el cliente bloquea imágenes, la firma debe leerse igual.
- Texto en la tipografía del sistema, tinta `#1b1f24`, enlace en azul pizarra. Sin frases motivacionales, sin banners, sin íconos de redes de colores.
- Aviso de confidencialidad breve, opcional, en tinta secundaria a 12 px.

---

## 9. Cuidado de la marca

- **Registro:** solicitar ante el INPI la marca mixta (isotipo + "Doy Fe") en clases 9 y 42, y la denominativa "DoyFe"; por la descriptividad de la fórmula, la mixta es la protección principal.
- **Dominios y cuentas:** mantener `doyfe.ar`, `doyfe.com.ar` y todos los handles de la sección 3 a nombre de la empresa, con doble factor.
- **Revisión:** toda pieza pública pasa por esta checklist antes de salir: nombre bien escrito, logo con resguardo y sin alteraciones, contrastes de la sección 5, glosario de la sección 2, cero promesas absolutas de seguridad.
- **Cambios a esta guía:** se proponen por pull request y se registran con fecha.

_Versión 1 — 13 de septiembre de 2026._
