/**
 * @file The offline pack (spec 7.7): emergency sheets, the next 30 days, key contacts and bills,
 * kept on this phone for when the Mac can't be reached.
 *
 * Off by default. Turning it on takes a passkey, because it puts personal facts on a device;
 * turning it off deletes this device's copy at once. When Brain can't be reached, the page shows
 * the copy saved here and says when it was made.
 */
import { useSettings } from "../api/queries";
import { useOfflinePack } from "../api/offline";
import { Page } from "../components/Page";
import { QueryState } from "../components/QueryState";
import { RowGroups } from "../components/Rows";
import { SettingRow } from "../components/SettingControl";
import { clockTime } from "../design/time";

/** The offline pack page. */
export default function OfflinePack() {
  const settings = useSettings();
  const setting = settings.data?.settings.find((s) => s.key === "offline_pack");
  const on = setting ? setting.value === "on" : undefined;
  const pack = useOfflinePack(on);
  return (
    <Page title="Offline pack" subtitle="What your phone keeps for when the Mac can't be reached.">
      {setting && (
        <div className="list">
          <SettingRow setting={setting} />
        </div>
      )}
      {on === false ? (
        <p className="list empty">
          Off. Turn it on to keep emergency sheets, the next 30 days, key contacts and bills on this
          device. It is refreshed each day and stays only on your own devices.
        </p>
      ) : (
        <QueryState query={pack}>
          {({ pack: saved, fromDevice }) => (
            <>
              <p className="muted small">
                {fromDevice
                  ? "Brain can't be reached. Showing the copy saved on this device"
                  : "Saved on this device"}
                {` · made at ${clockTime(saved.generated_at)}`}
              </p>
              <RowGroups groups={saved.groups} />
            </>
          )}
        </QueryState>
      )}
    </Page>
  );
}
