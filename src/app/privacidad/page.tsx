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
    <LegalPage title="Privacidad" updated="26 de septiembre de 2026">
      <h2>Quién trata tus datos</h2>
      <p>
        <Legal field="name" /> (NIF <Legal field="nif" />), con domicilio en <Legal field="address" />. Para cualquier cosa
        sobre tus datos, escríbenos a <Legal field="email" />.
      </p>

      <h2>Si encargas una tarta</h2>
      <p>
        Tratamos tu nombre, teléfono, email y, si nos la das, tu empresa, para gestionar el pedido, cobrarlo y hablar contigo
        sobre la entrega. La base es el contrato que haces con nosotros (art. 6.1.b RGPD).
      </p>
      <p>
        El pago lo gestiona Stripe en su propia página segura: nosotros no vemos ni guardamos los datos de tu tarjeta.
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
        de su cumpleaños (sin el año) y la dirección de la oficina. Los tratamos por encargo de esa empresa y solo para
        preparar y entregar esas tartas, mientras el servicio siga activo.
      </p>

      <h2>Cuánto tiempo</h2>
      <ul>
        <li>
          {RETENTION_DAYS.orders} días después de la entrega borramos los nombres, direcciones, teléfonos, emails, mensajes y
          la foto del pedido. Conservamos solo qué se vendió, cuándo y por cuánto, porque la ley nos obliga a guardar la
          contabilidad.
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
