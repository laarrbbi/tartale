import type { Metadata } from 'next';

import { Legal, LegalPage } from '@/components/site/legal-page';
import { SLOTS } from '@/lib/orders';

export const metadata: Metadata = {
  title: 'Condiciones',
  description: 'Cómo funciona la compra: precio, pago, entrega y devoluciones.',
};

export default function TermsPage() {
  return (
    <LegalPage title="Condiciones de compra" updated="27 de septiembre de 2026">
      <h2>Qué compras</h2>
      <p>
        Una tarta de la carta de una pastelería asociada de la ciudad de destino, que la prepara y la entrega, con la foto y la
        frase que elijas impresas encima. Tu mensaje va en una tarjeta impresa, en el diseño que elijas, dentro de la caja. Si
        añades un documento (un CV, una propuesta…), lo imprimimos y va con ella. Las vistas previas de la web son
        orientativas.
      </p>

      <h2>Precio y pago</h2>
      <p>
        El precio es el que ves antes de pagar: la tarta según el sabor y el tamaño, más la entrega. Los precios incluyen los
        impuestos aplicables. Se paga con tarjeta al hacer el pedido, a través de Stripe.
      </p>

      <h2>Entrega</h2>
      <p>
        En la dirección, el día y la franja que elijas: por la mañana ({SLOTS.manana.hours}) o por la tarde (
        {SLOTS.tarde.hours}). Para que llegue bien, indícanos la planta, la recepción o lo que ayude a encontrarla.
      </p>
      <p>Si no podemos entregarla, te devolvemos el importe íntegro.</p>

      <h2>La foto, los textos y el documento</h2>
      <p>
        La foto y el documento que subes, y lo que escribes en la tarta y en la tarjeta, son tuyos, y nos confirmas que puedes
        usarlos. No imprimimos
        contenido ofensivo, ilegal o que vulnere derechos de otras personas; si un pedido lo tuviera, lo cancelamos y te
        devolvemos el dinero.
      </p>

      <h2>Alergias</h2>
      <p>
        Indícalas en el pedido. Si la pastelería no puede adaptar la tarta, te lo decimos antes de hornearla y te devolvemos
        el dinero.
      </p>

      <h2>Desistimiento</h2>
      <p>
        Al ser un producto personalizado y perecedero, no hay derecho de desistimiento (art. 103, letras c y d, de la Ley
        General para la Defensa de los Consumidores y Usuarios). Si necesitas cambiar algo, escríbenos cuanto antes.
      </p>

      <h2>Contacto y reclamaciones</h2>
      <p>
        Escríbenos a <Legal field="email" />. Titular: <Legal field="name" />, NIF <Legal field="nif" />,{' '}
        <Legal field="address" />.
      </p>
    </LegalPage>
  );
}
