import type { WeatherLocation } from "@home-panel/shared";
import { MapPinIcon, PencilSimpleIcon, PlusIcon, StarIcon, TrashIcon } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import {
  useCreateLocation,
  useDeleteLocation,
  useSetDefaultLocation,
  useUpdateLocation,
  useWeatherLocations,
} from "../../lib/hooks/useWeather";
import { useT } from "../../lib/useT";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

interface LocationFormData {
  label: string;
  latitude: string;
  longitude: string;
}

const EMPTY_FORM: LocationFormData = { label: "", latitude: "", longitude: "" };

type TFn = (key: string) => string;

function validateForm(data: LocationFormData, t: TFn): string | null {
  if (!data.label.trim()) return t("settings.errors.nameRequired");
  const lat = Number(data.latitude);
  if (Number.isNaN(lat) || lat < -90 || lat > 90) return t("settings.errors.latitudeRange");
  const lng = Number(data.longitude);
  if (Number.isNaN(lng) || lng < -180 || lng > 180) return t("settings.errors.longitudeRange");
  return null;
}

export function WeatherSettings() {
  const { t } = useT("weather");
  const { t: tCommon } = useT("common");
  const { t: tSettings } = useT("settings");
  const { data: locations } = useWeatherLocations();
  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();
  const deleteLocation = useDeleteLocation();
  const setDefault = useSetDefaultLocation();

  const [addOpen, setAddOpen] = useState(false);
  const [editLocation, setEditLocation] = useState<WeatherLocation | null>(null);
  const [form, setForm] = useState<LocationFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const openAdd = useCallback(() => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setAddOpen(true);
  }, []);

  const openEdit = useCallback((loc: WeatherLocation) => {
    setForm({
      label: loc.label,
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
    });
    setFormError(null);
    setEditLocation(loc);
  }, []);

  const closeModal = useCallback(() => {
    setAddOpen(false);
    setEditLocation(null);
    setFormError(null);
  }, []);

  const tStr = useCallback<TFn>((key) => t(key as never) as string, [t]);

  const handleAdd = useCallback(() => {
    const err = validateForm(form, tStr);
    if (err) {
      setFormError(err);
      return;
    }
    createLocation.mutate(
      {
        label: form.label.trim(),
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
      },
      { onSuccess: () => closeModal() },
    );
  }, [form, createLocation, closeModal, tStr]);

  const handleEdit = useCallback(() => {
    if (!editLocation) return;
    const err = validateForm(form, tStr);
    if (err) {
      setFormError(err);
      return;
    }
    updateLocation.mutate(
      {
        id: editLocation.id,
        label: form.label.trim(),
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
      },
      { onSuccess: () => closeModal() },
    );
  }, [form, editLocation, updateLocation, closeModal, tStr]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteLocation.mutate(id);
    },
    [deleteLocation],
  );

  const handleSetDefault = useCallback(
    (id: string) => {
      setDefault.mutate(id);
    },
    [setDefault],
  );

  if (!locations) return null;

  const isModalOpen = addOpen || editLocation !== null;

  return (
    <section className="flex flex-col gap-5">
      <h2 className="font-display text-3xl">{t("title")}</h2>

      <div className="rounded-md bg-surface border border-border p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl flex items-center gap-2">
            <MapPinIcon size={22} weight="duotone" />
            {t("settings.locations")}
          </h3>
          <Button variant="ghost" size="sm" onClick={openAdd} iconLeft={<PlusIcon size={18} />}>
            {t("settings.add")}
          </Button>
        </div>

        {locations.length === 0 && (
          <p className="text-sm text-text-muted">{t("settings.noLocations")}</p>
        )}

        <ul className="flex flex-col gap-3">
          {locations.map((loc) => (
            <li
              key={loc.id}
              className="flex items-center gap-4 p-4 rounded-md border border-border bg-bg"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{loc.label}</span>
                  {loc.isDefault && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                      <StarIcon size={12} weight="fill" />
                      Predefinita
                    </span>
                  )}
                </div>
                <span className="text-sm text-text-muted">
                  {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {!loc.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(loc.id)}
                    disabled={setDefault.isPending}
                    title={tSettings("weather.setDefault")}
                    className="p-2 rounded-sm hover:bg-surface text-text-muted hover:text-accent transition-colors"
                  >
                    <StarIcon size={20} weight="duotone" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openEdit(loc)}
                  title={tCommon("actions.edit")}
                  className="p-2 rounded-sm hover:bg-surface text-text-muted hover:text-text transition-colors"
                >
                  <PencilSimpleIcon size={20} weight="duotone" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(loc.id)}
                  disabled={locations.length <= 1 || deleteLocation.isPending}
                  title={
                    locations.length <= 1
                      ? t("settings.cannotDeleteLast")
                      : tCommon("actions.delete")
                  }
                  className="p-2 rounded-sm hover:bg-surface text-text-muted hover:text-danger transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <TrashIcon size={20} weight="duotone" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Add / Edit modal */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={editLocation ? t("settings.editLocation") : t("settings.addLocation")}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={closeModal}>
              {tCommon("actions.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={editLocation ? handleEdit : handleAdd}
              isLoading={createLocation.isPending || updateLocation.isPending}
            >
              {editLocation ? tCommon("actions.save") : tCommon("actions.add")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label={t("settings.fields.name")}
            placeholder={tSettings("weather.placeholders.name")}
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t("settings.fields.latitude")}
              type="number"
              step="any"
              min={-90}
              max={90}
              placeholder={tSettings("weather.placeholders.latitude")}
              value={form.latitude}
              onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
            />
            <Input
              label={t("settings.fields.longitude")}
              type="number"
              step="any"
              min={-180}
              max={180}
              placeholder={tSettings("weather.placeholders.longitude")}
              value={form.longitude}
              onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
            />
          </div>
          {formError && <p className="text-sm text-danger">{formError}</p>}
        </div>
      </Modal>
    </section>
  );
}
