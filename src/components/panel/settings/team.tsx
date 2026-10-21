"use client";

import * as React from "react";
import { Trash2, UserPlus, X } from "lucide-react";

import { cancelInviteAction, changeMemberRoleAction, inviteMemberAction, removeMemberAction } from "@/app/panel/settings/team/actions";
import { failureText, type ActionResult } from "@/components/panel/overview/action-result";
import { Alert } from "@/components/ui/alert";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/date";
import { formatIranMobile } from "@/lib/persian";
import { fa } from "@/lib/utils";

type Role = "owner" | "agent";

export interface TeamMemberView {
  userId: string;
  name: string;
  phone: string;
  role: Role;
  since: string;
}

export interface TeamInviteView {
  id: string;
  phone: string;
  role: Role;
  createdAt: string;
}

const ROLE_FA: Record<Role, string> = { owner: "مالک", agent: "اپراتور" };
const ROLE_OPTIONS = [
  { value: "agent", label: ROLE_FA.agent },
  { value: "owner", label: ROLE_FA.owner },
];

const mobile = (phone: string) => (
  <bdi dir="ltr" className="whitespace-nowrap">
    {fa(`0${formatIranMobile(phone)}`)}
  </bdi>
);

/** Runs a team action in a transition and reports a failure in a toast; the page re-renders with fresh rows. */
function useTeamAction() {
  const { toast } = useToast();
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<ActionResult>, success: string, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast({ title: success, variant: "success" });
        onOk?.();
      } else toast({ title: "انجام نشد", description: failureText(r), variant: "error" });
    });
  return { pending, run };
}

export function TeamManager({ selfId, members, invites }: { selfId: string; members: TeamMemberView[]; invites: TeamInviteView[] }) {
  return (
    <div className="flex flex-col gap-6">
      <InviteForm />
      <MembersCard selfId={selfId} members={members} />
      <InvitesCard invites={invites} />
    </div>
  );
}

function InviteForm() {
  const { toast } = useToast();
  const [phone, setPhone] = React.useState("");
  const [role, setRole] = React.useState<Role>("agent");
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null);
  const [pending, start] = React.useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>دعوت به تیم</CardTitle>
        <CardDescription>همکارتان را با شماره‌ی موبایلش دعوت کنید تا با حساب خودش در پنل همین فروشگاه کار کند.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await inviteMemberAction({ phone, role });
              if (r.ok) {
                setPhone("");
                toast({ title: "دعوت ثبت شد", description: "به همکارتان بگویید با همین شماره در sepordi.ir وارد شود یا ثبت‌نام کند.", variant: "success" });
              } else {
                setError({ field: r.field, message: r.message });
                if (!r.field) toast({ title: "دعوت ثبت نشد", description: failureText(r), variant: "error" });
              }
            });
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="شماره‌ی موبایل" htmlFor="invite-phone">
              <PhoneInput id="invite-phone" value={phone} onChange={(d) => setPhone(d)} error={error?.field === "phone" ? error.message : undefined} />
            </Field>
            <Field label="نقش" htmlFor="invite-role">
              <Select id="invite-role" options={ROLE_OPTIONS} value={role} onChange={(e) => setRole(e.target.value as Role)} />
              {error?.field === "role" && <p className="text-sm text-destructive">{error.message}</p>}
            </Field>
          </div>
          <div>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? <Spinner size="sm" className="text-current" /> : <UserPlus className="size-4" strokeWidth={2} />}
              {pending ? "در حال ثبت دعوت…" : "دعوت کن"}
            </Button>
          </div>
        </form>
        <Alert variant="info" title="پیامکی فرستاده نمی‌شود">
          <p>
            خودتان به همکارتان خبر بدهید که با همین شماره در <bdi dir="ltr">sepordi.ir</bdi> وارد شود یا ثبت‌نام کند؛ همان لحظه به تیم اضافه
            می‌شود و نیازی به ساختن فروشگاه ندارد.
          </p>
          <p className="mt-2">
            مالک به همه‌ی بخش‌ها دسترسی دارد. اپراتور فقط داشبورد، صندوق پیام، سفارش‌ها، محصولات و مرجوعی‌ها را می‌بیند و به پرداخت، کانال‌ها،
            اعتبار، ارسال، دستیار و تیم دسترسی ندارد.
          </p>
        </Alert>
      </CardContent>
    </Card>
  );
}

function MembersCard({ selfId, members }: { selfId: string; members: TeamMemberView[] }) {
  const { pending, run } = useTeamAction();
  const [removing, setRemoving] = React.useState<TeamMemberView | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>اعضای تیم</CardTitle>
        <CardDescription>{fa(members.length)} عضو</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>نام</TableHead>
              <TableHead>موبایل</TableHead>
              <TableHead>نقش</TableHead>
              <TableHead>
                <span className="sr-only">کارها</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => {
              const self = m.userId === selfId;
              return (
                <TableRow key={m.userId}>
                  <TableCell className="min-w-32">
                    <span className="font-medium">{m.name || "بدون نام"}</span>
                    {self && <span className="ms-2 text-sm text-muted-foreground">(شما)</span>}
                    <p className="text-sm text-muted-foreground">از {formatDate(m.since)}</p>
                  </TableCell>
                  <TableCell>{mobile(m.phone)}</TableCell>
                  <TableCell className="min-w-32">
                    {self ? (
                      ROLE_FA[m.role]
                    ) : (
                      <Select
                        aria-label={`نقش ${m.name || "این عضو"}`}
                        options={ROLE_OPTIONS}
                        value={m.role}
                        disabled={pending}
                        onChange={(e) => run(() => changeMemberRoleAction(m.userId, e.target.value), "نقش عوض شد")}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    {!self && (
                      <Button variant="ghost" className="h-11 text-destructive" disabled={pending} onClick={() => setRemoving(m)}>
                        <Trash2 className="size-4" strokeWidth={1.5} />
                        برداشتن
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
      <AlertDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="از تیم برداشته شود؟"
        description={removing ? `«${removing.name || "این عضو"}» دیگر به پنل این فروشگاه دسترسی ندارد.` : undefined}
        confirmText="برداشتن"
        destructive
        onConfirm={() => {
          const m = removing;
          setRemoving(null);
          if (m) run(() => removeMemberAction(m.userId), "از تیم برداشته شد");
        }}
      />
    </Card>
  );
}

function InvitesCard({ invites }: { invites: TeamInviteView[] }) {
  const { pending, run } = useTeamAction();

  return (
    <Card>
      <CardHeader>
        <CardTitle>دعوت‌های در انتظار</CardTitle>
        <CardDescription>تا صاحب شماره وارد نشده، دعوت باز می‌ماند.</CardDescription>
      </CardHeader>
      <CardContent>
        {invites.length === 0 ? (
          <p className="text-muted-foreground">دعوت بازی ندارید.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {invites.map((i) => (
              <li key={i.id} className="flex min-h-14 flex-wrap items-center justify-between gap-2 py-2">
                <div className="flex flex-col">
                  {mobile(i.phone)}
                  <span className="text-sm text-muted-foreground">
                    {ROLE_FA[i.role]} · {formatDate(i.createdAt)}
                  </span>
                </div>
                <Button variant="outline" className="h-11" disabled={pending} onClick={() => run(() => cancelInviteAction(i.id), "دعوت لغو شد")}>
                  <X className="size-4" strokeWidth={1.5} />
                  لغو دعوت
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
