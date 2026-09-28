import type { Metadata } from 'next';

import { Legal, LegalPage } from '@/components/site/legal-page';
import { RETENTION_DAYS } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Privacidad',
  description: 'Qué datos tratamos, para qué, cuánto tiempo y cómo ejercer tus derechos.',
};

/**
 * RGPD arts. 13 and 14: the sender gives us their own data and the
 * recipient's, so this page speaks to both. The retention periods are read
 * from the same constants the nightly sweep enforces.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacidad" updated="28 de septiembre de 2026">
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
        <li>Las copias de seguridad, cifradas, se borran solas a los 30 días.</li>
      </ul>

      <h2>Quién más los ve</h2>
      <ul>
        <li>La pastelería que hornea y entrega la tarta: lo necesario para hacerla y llevarla.</li>
        <li>Stripe, que procesa el pago.</li>
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
      </p>
    </LegalPage>
  );
}
