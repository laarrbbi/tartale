import type { Metadata } from 'next';

import { Legal, LegalPage } from '@/components/site/legal-page';
import { PROVIDER_LABELS } from '@/lib/accounts';
import { BRAND } from '@/lib/brand';
import { RETENTION_DAYS, TTL } from '@/lib/constants';
import { configuredProviders } from '@/server/auth/oidc';

export const metadata: Metadata = {
  title: 'Privacidad',
  description: 'Qué datos tratamos, para qué, cuánto tiempo y cómo ejercer tus derechos.',
};

function joinOr(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} o ${items.at(-1)}`;
}

/**
 * RGPD arts. 13 and 14: the sender gives us their own data and the
 * recipient's, so this page speaks to both. The retention periods are read
 * from the same constants the nightly sweep enforces, and accounts are
 * described only once a way to sign in is switched on, naming those ways.
 */
export default function PrivacyPage() {
  const providers = joinOr(configuredProviders().map((p) => PROVIDER_LABELS[p]));
  const accountYears = RETENTION_DAYS.customerAccounts / 365;
  return (
    <LegalPage title="Privacidad" updated="7 de octubre de 2026">
      <h2>Quién trata tus datos</h2>
      <p>
        <Legal field="name" /> (NIF <Legal field="nif" />), con domicilio en <Legal field="address" />. Para cualquier cosa
        sobre tus datos, escríbenos a <Legal field="email" />.
      </p>

      <h2>Si encargas una tarta</h2>
      <p>
        Tratamos tu nombre, teléfono, email y, si nos la das, tu empresa, para gestionar el pedido, cobrarlo y hablar contigo
        sobre la entrega. Si subes una foto para la tarta o un documento para la caja (un CV, por ejemplo), los guardamos solo
        para imprimirlos y los borramos con el resto del pedido. La base es el contrato que haces con nosotros (art. 6.1.b RGPD).
      </p>
      <p>
        El pago lo gestiona Stripe en su propia página segura: nosotros no vemos ni guardamos los datos de tu tarjeta.
      </p>
      <p>
        Si pides la factura a nombre de una empresa o como autónomo, tratamos también la razón social o tu nombre, el NIF y la
        dirección fiscal, para emitirla. La base es la obligación legal de facturar (art. 6.1.c RGPD).
      </p>

      {providers ? (
        <>
          <h2>Si tienes cuenta</h2>
          <p>
            Para enviar una tarta no hace falta cuenta. Si quieres una, entras con {providers}: no guardamos contraseñas. El
            servicio con el que entres nos da un identificador de tu cuenta con ellos, tu email y, si lo tiene, tu nombre. Si
            entras con Apple y ocultas tu email, nos llega una dirección de reenvío de Apple.
          </p>
          <p>
            Los usamos para que entres, para enseñarte tus pedidos y para que el siguiente pedido empiece con tus datos: nombre,
            teléfono, empresa y, si los guardas, los datos para tus facturas. Cuando pides con la cuenta abierta, guardamos en
            ella los datos que usaste, para la próxima vez. La base es el contrato que haces con nosotros (art. 6.1.b RGPD).
          </p>
          <p>
            Puedes cambiar esos datos o borrar la cuenta cuando quieras, desde la propia cuenta. Al borrarla desaparecen al
            momento tus datos guardados y tus inicios de sesión; tus pedidos se quedan sin cuenta y siguen las mismas reglas que
            cualquier otro.
          </p>
        </>
      ) : null}

      <h2>Si recibes una tarta</h2>
      <p>
        Quien te la envía nos ha dado tu nombre, la dirección de entrega, tu empresa y, si quiso, un teléfono, junto con el
        mensaje de la tarjeta y la foto de la tarta. Los usamos <strong>solo para prepararla y entregártela</strong>: nunca te
        escribimos, no te mandamos publicidad y no los usamos para nada más. La base es el interés legítimo de quien te la
        envía, y el nuestro, en que la tarta llegue (art. 6.1.f RGPD).
      </p>

      <h2>Novedades por email</h2>
      <p>
        Solo si marcas la casilla al hacer el pedido, que aparece sin marcar. Puedes retirar el consentimiento cuando quieras
        escribiendo a <Legal field="email" />.
      </p>

      <h2>Cumpleaños de empresas</h2>
      <p>
        Cuando una empresa nos pide las tartas de cumpleaños de su equipo, nos da el nombre de cada persona, el día y el mes
        de su cumpleaños (sin el año) y la dirección donde entregarla, normalmente la de la oficina. Los tratamos por encargo
        de esa empresa (art. 28 RGPD) y solo para preparar y entregar esas tartas. Borramos a cada persona de la lista cuando
        la empresa nos lo pide o deja el servicio; los pedidos ya hechos siguen la regla de los {RETENTION_DAYS.orders} días.
        Las facturas van a nombre de la empresa, con sus datos fiscales, y nunca llevan el nombre de nadie de la lista.
      </p>

      <h2>Cuánto tiempo</h2>
      <ul>
        <li>
          {RETENTION_DAYS.orders} días después de la entrega borramos los nombres, direcciones, teléfonos, emails, mensajes, la
          foto y el documento del pedido, y los datos que dejaste para la factura. Conservamos solo qué se vendió, cuándo y por
          cuánto, porque la ley nos obliga a guardar la contabilidad.
        </li>
        <li>
          Las facturas se conservan seis años, como exige el Código de Comercio (art. 30), con los datos del cliente que
          aparecen en ellas. Nunca llevan los datos de quien recibe la tarta.
        </li>
        <li>Un pedido que no se llega a pagar se borra entero a los {RETENTION_DAYS.unpaidOrders} días.</li>
        {providers ? (
          <li>
            Una cuenta en la que nadie entra en {accountYears} años se borra, con sus datos guardados. Mientras exista, en ella
            se ven sus pedidos; de los que ya pasaron los {RETENTION_DAYS.orders} días, solo qué tarta, cuándo y por cuánto.
          </li>
        ) : null}
        <li>Las copias de seguridad, cifradas, se borran solas a los 30 días.</li>
      </ul>

      <h2>Quién más los ve</h2>
      <ul>
        <li>La pastelería que hornea y entrega la tarta: lo necesario para hacerla y llevarla.</li>
        <li>Stripe, que procesa el pago.</li>
        {providers ? (
          <li>
            {providers}, si entras con ellos: saben que has entrado en {BRAND.name}, y lo tratan según su propia política de
            privacidad.
          </li>
        ) : null}
        <li>
          Nuestros proveedores técnicos, que guardan los datos por nosotros: Vercel (la web) y Supabase (la base de datos, en
          servidores de la Unión Europea); y GitHub, donde guardamos las copias de seguridad cifradas. Cuando alguno está
          fuera del Espacio Económico Europeo, la transferencia se ampara en las garantías del RGPD, como el Marco de
          Privacidad de Datos UE-EE. UU.
        </li>
      </ul>

      <h2>Tus derechos</h2>
      <p>
        Puedes pedirnos acceder a tus datos, corregirlos, borrarlos, limitar su uso, oponerte o llevártelos, escribiendo a{' '}
        <Legal field="email" />. Si crees que no lo hemos hecho bien, puedes reclamar ante la Agencia Española de Protección
        de Datos (<a href="https://www.aepd.es">aepd.es</a>).
      </p>

      <h2>Cookies</h2>
      <p>
        La web no usa cookies de publicidad ni de analítica. El panel interno del equipo usa cookies técnicas para mantener
        la sesión, que son necesarias y no requieren consentimiento.
        {providers
          ? ` Si entras con tu cuenta, usamos una cookie técnica que mantiene la sesión (${TTL.customerSession / 86_400} días) y otra que, solo mientras entras, comprueba que la respuesta de ${providers} es para ti (${TTL.signIn / 60} minutos). También son necesarias y no requieren consentimiento.`
          : null}
      </p>
    </LegalPage>
  );
}
