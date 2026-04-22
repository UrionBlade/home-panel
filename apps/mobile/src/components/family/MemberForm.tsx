import type { CreateFamilyMemberInput, FamilyMember, FamilyMemberKind } from "@home-panel/shared";
import { type FormEvent, useState } from "react";
import { useT } from "../../lib/useT";
import { Button } from "../ui/Button";
import { Dropdown } from "../ui/Dropdown";
import { Input } from "../ui/Input";

interface MemberFormProps {
  initial?: FamilyMember;
  onSubmit: (input: CreateFamilyMemberInput) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function MemberForm({ initial, onSubmit, onCancel, isSubmitting }: MemberFormProps) {
  const { t } = useT("family");
  const { t: tCommon } = useT("common");
  const [kind, setKind] = useState<FamilyMemberKind>(initial?.kind ?? "human");
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [accentColor, setAccentColor] = useState(initial?.accentColor ?? "");
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? "");
  const [role, setRole] = useState(initial?.kind === "human" ? (initial.role ?? "") : "");
  const [species, setSpecies] = useState(initial?.kind === "pet" ? (initial.species ?? "") : "");
  const [breed, setBreed] = useState(initial?.kind === "pet" ? (initial.breed ?? "") : "");
  const [weightKg, setWeightKg] = useState(
    initial?.kind === "pet" && initial.weightKg !== null ? String(initial.weightKg) : "",
  );
  const [vetNotes, setVetNotes] = useState(
    initial?.kind === "pet" ? (initial.veterinaryNotes ?? "") : "",
  );

  const [error, setError] = useState<string | null>(null);

  const isEdit = !!initial;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      setError(t("errors.displayNameRequired"));
      return;
    }
    setError(null);

    if (kind === "human") {
      onSubmit({
        kind: "human",
        displayName,
        accentColor: accentColor || null,
        birthDate: birthDate || null,
        role: role || null,
      });
    } else {
      onSubmit({
        kind: "pet",
        displayName,
        accentColor: accentColor || null,
        birthDate: birthDate || null,
        species: species || null,
        breed: breed || null,
        weightKg: weightKg ? Number(weightKg) : null,
        veterinaryNotes: vetNotes || null,
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {!isEdit && (
        <Dropdown
          label="Tipo"
          value={kind}
          onChange={(v) => setKind(v as FamilyMemberKind)}
          options={[
            { value: "human", label: t("kindLabel.human") },
            { value: "pet", label: t("kindLabel.pet") },
          ]}
        />
      )}

      <Input
        label={t("fields.displayName")}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder={t("fields.displayNamePlaceholder")}
        error={error ?? undefined}
        autoFocus
        required
      />

      <Input
        label={t("fields.accentColor")}
        value={accentColor}
        onChange={(e) => setAccentColor(e.target.value)}
        placeholder="oklch(72% 0.13 30)"
      />

      <Input
        label={t("fields.birthDate")}
        type="date"
        value={birthDate}
        onChange={(e) => setBirthDate(e.target.value)}
      />

      {kind === "human" && (
        <Input
          label={t("fields.role")}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder={t("fields.rolePlaceholder")}
        />
      )}

      {kind === "pet" && (
        <>
          <Input
            label={t("fields.species")}
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
            placeholder={t("fields.speciesPlaceholder")}
          />
          <Input
            label={t("fields.breed")}
            value={breed}
            onChange={(e) => setBreed(e.target.value)}
            placeholder={t("fields.breedPlaceholder")}
          />
          <Input
            label={t("fields.weightKg")}
            type="number"
            inputMode="decimal"
            step="0.1"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
          />
          <Input
            label={t("fields.veterinaryNotes")}
            value={vetNotes}
            onChange={(e) => setVetNotes(e.target.value)}
          />
        </>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel}>
          {tCommon("actions.cancel")}
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {isEdit ? tCommon("actions.save") : tCommon("actions.add")}
        </Button>
      </div>
    </form>
  );
}
