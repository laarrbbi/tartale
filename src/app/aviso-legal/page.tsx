import type { Metadata } from 'next';

import { Legal, LegalPage } from '@/components/site/legal-page';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Aviso legal',
  description: `Quién está detrás de ${BRAND.name}.`,
};

/** LSSI art. 10: who runs the site and how to reach them. */
export default function LegalNoticePage() {
  return (
    <LegalPage title="Aviso legal" updated="26 de septiembre de 2026">
      <h2>Titular</h2>
      <ul>
        <li>
          Titular: <Legal field="name" />
        </li>
        <li>
          NIF: <Legal field="nif" />
        </li>
        <li>
          Domicilio: <Legal field="address" />
        </li>
        <li>
          Email: <Legal field="email" />
        </li>
        <li>
          Datos registrales: <Legal field="registry" />
        </li>
      </ul>

      <h2>Qué es esta web</h2>
      <p>
        {BRAND.name} vende tartas personalizadas con una foto y un mensaje, que prepara y entrega una pastelería asociada de
        la ciudad de destino. Las condiciones de compra están en <a href="/condiciones">Condiciones</a> y el tratamiento de
        datos en <a href="/privacidad">Privacidad</a>.
      </p>

      <h2>Propiedad intelectual</h2>
      <p>
        Los textos, el diseño y la marca de esta web pertenecen a su titular o se usan con permiso. Las fotos de las tartas
        pertenecen a las pastelerías que las hacen. Las fotos que sube cada cliente siguen siendo suyas: solo las usamos para
        imprimir su tarta.
      </p>

      <h2>Ley aplicable</h2>
      <p>Esta web se rige por la ley española.</p>
    </LegalPage>
  );
}
