'use client';

import { AdminForm, FormBanner, SubmitButton } from '@/components/admin/form';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { ORDER_LIMITS, SLOTS, SLOT_IDS, STATUSES, eurosInput, formatEuros, nextStatus, type OrderStatus, type TimeSlot } from '@/lib/orders';
import {
  advanceOrderAction,
  cancelOrderAction,
  deleteOrderAction,
  eraseOrderAction,
  manualPaymentAction,
  refundOrderAction,
  restoreOrderAction,
  updateOrderAction,
} from '@/server/actions/order-actions';

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  confirmado: 'Confirmar el pedido',
  en_horno: 'Al horno',
  en_camino: 'Sale a repartir',
  entregado: 'Entregado ✓',
};

export function StatusControls({
  id,
  status,
  isOwner,
  refundable,
  awaitingPayment,
  csrfToken,
}: {
  id: number;
  status: OrderStatus;
  isOwner: boolean;
  refundable: number;
  awaitingPayment: boolean;
  csrfToken: string;
}) {
  const next = nextStatus(status);
  return (
    <div className="flex flex-col gap-3">
      {next && !awaitingPayment ? (
        <AdminForm action={advanceOrderAction} csrfToken={csrfToken}>
          {(state) => (
            <>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value={next} />
              <SubmitButton size="lg" className="w-full sm:w-auto" pendingLabel="Guardando…">
                {NEXT_LABEL[next] ?? STATUSES[next].label}
              </SubmitButton>
              <FormBanner state={state} />
            </>
          )}
        </AdminForm>
      ) : null}

      {isOwner && status !== 'cancelado' && status !== 'entregado' ? (
        <details className="rounded-card bg-surface px-4 py-3 ring-1 ring-line/70">
          <summary className="type-body font-medium text-critical">Cancelar el pedido…</summary>
          <AdminForm action={cancelOrderAction} csrfToken={csrfToken} className="mt-3">
            {(state) => (
              <>
                <input type="hidden" name="id" value={id} />
                {refundable > 0 ? (
                  <label className="flex items-start gap-3">
                    <input type="checkbox" name="refund" value="true" defaultChecked className="mt-1 h-5 w-5 accent-[var(--brand)]" />
                    <span className="type-body">
                      Devolver el pago ({formatEuros(refundable)}) a la tarjeta
                      <span className="type-caption block">«Si no podemos entregarla, te devolvemos el dinero.»</span>
                    </span>
                  </label>
                ) : null}
                <SubmitButton variant="danger" pendingLabel="Cancelando…" confirm="¿Cancelar este pedido?">
                  Cancelar el pedido
                </SubmitButton>
                <FormBanner state={state} />
              </>
            )}
          </AdminForm>
        </details>
      ) : null}

      {isOwner && status === 'cancelado' ? (
        <AdminForm action={restoreOrderAction} csrfToken={csrfToken} className="items-start">
          {(state) => (
            <>
              <input type="hidden" name="id" value={id} />
              <SubmitButton variant="secondary" pendingLabel="…">
                Recuperar el pedido
              </SubmitButton>
              <FormBanner state={state} />
            </>
          )}
        </AdminForm>
      ) : null}
    </div>
  );
}

export function RefundForm({ id, refundable, csrfToken }: { id: number; refundable: number; csrfToken: string }) {
  return (
    <AdminForm action={refundOrderAction} csrfToken={csrfToken}>
      {(state) => (
        <>
          <input type="hidden" name="id" value={id} />
          <Field label="Importe a devolver (€)" htmlFor="refund-amount" error={state.fieldErrors?.amount} hint={`Vacío: todo lo que queda (${formatEuros(refundable)}).`}>
            <Input id="refund-amount" name="amount" inputMode="decimal" placeholder={eurosInput(refundable)} />
          </Field>
          <SubmitButton variant="secondary" pendingLabel="Devolviendo…" confirm="¿Devolver este dinero a la tarjeta del cliente?">
            Devolver
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

export function UpdateOrderForm({
  id,
  deliverOn,
  timeSlot,
  staffNote,
  deliveryCents,
  bakeryId,
  bakeries,
  isOwner,
  csrfToken,
}: {
  id: number;
  deliverOn: string;
  timeSlot: TimeSlot;
  staffNote: string | null;
  deliveryCents: number;
  bakeryId: number;
  bakeries: { id: number; name: string }[];
  isOwner: boolean;
  csrfToken: string;
}) {
  return (
    <AdminForm action={updateOrderAction} csrfToken={csrfToken}>
      {(state) => (
        <>
          <input type="hidden" name="id" value={id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Día" htmlFor="deliverOn" error={state.fieldErrors?.deliverOn}>
              <Input id="deliverOn" name="deliverOn" type="date" defaultValue={deliverOn} required />
            </Field>
            <Field label="Franja" htmlFor="timeSlot" error={state.fieldErrors?.timeSlot}>
              <Select id="timeSlot" name="timeSlot" defaultValue={timeSlot}>
                {SLOT_IDS.map((slot) => (
                  <option key={slot} value={slot}>
                    {SLOTS[slot].label} ({SLOTS[slot].hours})
                  </option>
                ))}
              </Select>
            </Field>
            {isOwner ? (
              <Field label="Entrega (€)" htmlFor="deliveryEuros" error={state.fieldErrors?.deliveryEuros}>
                <Input id="deliveryEuros" name="deliveryEuros" inputMode="decimal" defaultValue={eurosInput(deliveryCents)} />
              </Field>
            ) : null}
            {isOwner && bakeries.length > 1 ? (
              <Field label="Pastelería" htmlFor="bakeryId" error={state.fieldErrors?.bakeryId}>
                <Select id="bakeryId" name="bakeryId" defaultValue={String(bakeryId)}>
                  {bakeries.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
          <Field label="Nota interna" htmlFor="staffNote" hint="Solo la ve el equipo. Se borra con el pedido.">
            <Textarea id="staffNote" name="staffNote" rows={2} maxLength={ORDER_LIMITS.notes} defaultValue={staffNote ?? ''} />
          </Field>
          <SubmitButton variant="secondary" pendingLabel="Guardando…">
            Guardar
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

export function ManualPaymentForm({ id, paid, csrfToken }: { id: number; paid: boolean; csrfToken: string }) {
  return (
    <AdminForm action={manualPaymentAction} csrfToken={csrfToken} className="items-start">
      {(state) => (
        <>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="paid" value={paid ? 'false' : 'true'} />
          <SubmitButton variant={paid ? 'ghost' : 'secondary'} size="sm" pendingLabel="…">
            {paid ? 'Marcar como no cobrado' : 'Marcar como cobrado'}
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

export function EraseOrderForm({ id, csrfToken }: { id: number; csrfToken: string }) {
  return (
    <AdminForm action={eraseOrderAction} csrfToken={csrfToken}>
      {(state) => (
        <>
          <input type="hidden" name="id" value={id} />
          <Field label="Escribe BORRAR" htmlFor={`confirm-${id}`} error={state.fieldErrors?.confirm}>
            <Input id={`confirm-${id}`} name="confirm" autoComplete="off" />
          </Field>
          <SubmitButton variant="danger" pendingLabel="Borrando…">
            Borrar los datos personales
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

export function DeleteOrderForm({ id, csrfToken }: { id: number; csrfToken: string }) {
  return (
    <AdminForm action={deleteOrderAction} csrfToken={csrfToken}>
      {(state) => (
        <>
          <input type="hidden" name="id" value={id} />
          <Field label="Escribe BORRAR" htmlFor={`delete-${id}`} error={state.fieldErrors?.confirm}>
            <Input id={`delete-${id}`} name="confirm" autoComplete="off" />
          </Field>
          <SubmitButton variant="danger" pendingLabel="Borrando…">
            Borrar el pedido entero
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}
