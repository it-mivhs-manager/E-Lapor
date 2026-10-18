import { useEffect, useMemo, useState } from "react";
import { PrimeReactProvider } from "primereact/api";
import { Dialog } from "primereact/dialog";
import DropdownComponent from "../../GlobalComponents/DropdownComponent/DropdownComponent";
import { useDashboardNavbarHook } from "../../../hooks/shared/useDashboardNavbar";
import UseUserDataHookEffect, { useUserDataHook } from "../../../hooks/shared/useUserData";
import UseReportConfigHookEffect, { useReportConfigHook } from "../../../hooks/shared/useReportConfig";
import { useReportDataHook } from "../../../hooks/shared/useReportData";
import { useMessageToastHook } from "../../../hooks/shared/useMessageToast";
import { AccountAPIPrivillage, Campus, string_to_campus, type Report_Location } from "../../../types/variables";
import { addRoom, deleteRoom, updateRoomPIC } from "../../../utils/api_interface";

export default function RoomsPage() {
  const { activeTab } = useDashboardNavbarHook();
  const { userPrivillages } = useUserDataHook();
  const { locationData, setLocationData } = useReportConfigHook();
  const { reportData, setReportData } = useReportDataHook();
  const { showMessage, showMessageByAPI } = useMessageToastHook();

  const [search, setSearch] = useState("");
  const [editedRoom, setEditedRoom] = useState<Report_Location | null>(null);
  const [picName, setPicName] = useState("");
  const [loading, setLoading] = useState(false);

  const [addingRoom, setAddingRoom] = useState(false);
  const [newRoom, setNewRoom] = useState({ location: "", campus_name: "", pic_name: "" });
  const [addingLoading, setAddingLoading] = useState(false);

  const [deletedRoom, setDeletedRoom] = useState<Report_Location | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingLoading, setDeletingLoading] = useState(false);

  const showedRooms = useMemo(() => {
    const keyword = search.toLowerCase();
    return locationData
      .filter((room) => [room.location, room.pic_name, room.campus_name].some((value) => value.toLowerCase().includes(keyword)))
      .sort((a, b) => a.campus_name.localeCompare(b.campus_name) || a.location.localeCompare(b.location));
  }, [locationData, search]);

  if (activeTab !== 7) {
    return <></>;
  }

  const canEdit = userPrivillages.includes(AccountAPIPrivillage.UpdatePIC);
  const canAdd = userPrivillages.includes(AccountAPIPrivillage.CreatePIC);
  const canDelete = userPrivillages.includes(AccountAPIPrivillage.DeletePIC);

  const openDelete = (room: Report_Location) => {
    setDeletedRoom(room);
    setDeleteConfirmText("");
  };

  const handleDelete = async () => {
    // Typed confirmation guards an irreversible delete of the room and all its reports.
    if (!deletedRoom || deleteConfirmText !== deletedRoom.location) return;

    setDeletingLoading(true);
    const result = await deleteRoom(deletedRoom.id);
    setDeletingLoading(false);

    if (typeof result === "object") {
      setLocationData(locationData.filter((room) => room.id !== result.id));
      // Reports of this room were deleted on the server; drop them from the local cache.
      if (reportData) {
        setReportData(reportData.filter((report) => report.location_name !== result.location));
      }
      showMessage("Berhasil menghapus ruangan", "success", `${result.location} dan ${result.deleted_reports} laporan terhapus.`);
      setDeletedRoom(null);
    }
    else if (result === false) {
      showMessage("Gagal menghapus ruangan", "error", "Ruangan tidak ditemukan atau terjadi kesalahan jaringan.");
    }
    else {
      showMessageByAPI(result);
    }
  };

  const handleAdd = async () => {
    const location = newRoom.location.trim();
    const pic_name = newRoom.pic_name.trim();
    const campus_name = string_to_campus(newRoom.campus_name);

    if (!location) {
      showMessage("Nama ruangan tidak boleh kosong!", "warn");
      return;
    }
    if (!campus_name) {
      showMessage("Kampus harus dipilih!", "warn");
      return;
    }
    if (!pic_name) {
      showMessage("Nama PIC tidak boleh kosong!", "warn");
      return;
    }
    if (locationData.some((room) => room.location.toLowerCase() === location.toLowerCase())) {
      showMessage("Ruangan sudah ada!", "warn", `${location} sudah terdaftar.`);
      return;
    }

    setAddingLoading(true);
    const result = await addRoom(location, campus_name, pic_name);
    setAddingLoading(false);

    if (typeof result === "object") {
      setLocationData([...locationData, result]);
      showMessage("Berhasil menambahkan ruangan", "success", `${result.location} dengan PIC ${result.pic_name}.`);
      setAddingRoom(false);
      setNewRoom({ location: "", campus_name: "", pic_name: "" });
    }
    else if (result === false) {
      showMessage("Gagal menambahkan ruangan", "error", "Data tidak valid atau terjadi kesalahan jaringan.");
    }
    else {
      showMessageByAPI(result);
    }
  };

  const openEdit = (room: Report_Location) => {
    setEditedRoom(room);
    setPicName(room.pic_name);
  };

  const handleSave = async () => {
    if (!editedRoom) return;

    const newPicName = picName.trim();
    if (!newPicName) {
      showMessage("Nama PIC tidak boleh kosong!", "warn");
      return;
    }
    if (newPicName === editedRoom.pic_name) {
      setEditedRoom(null);
      return;
    }

    setLoading(true);
    const result = await updateRoomPIC(editedRoom.location, newPicName);
    setLoading(false);

    if (typeof result === "object") {
      setLocationData(locationData.map((room) => room.id === result.id ? { ...room, pic_name: result.pic_name } : room));
      // Reports follow the room's PIC on the server (FK cascade); mirror it locally.
      if (reportData) {
        setReportData(reportData.map((report) => report.location_name === result.location ? { ...report, pic_name: result.pic_name } : report));
      }
      showMessage("Berhasil update PIC", "success", `PIC ${result.location} sekarang ${result.pic_name}.`);
      setEditedRoom(null);
    }
    else if (result === false) {
      showMessage("Gagal update PIC", "error", "Ruangan tidak ditemukan atau terjadi kesalahan jaringan.");
    }
    else {
      showMessageByAPI(result);
    }
  };

  return (
    <>
      <UseUserDataHookEffect adminOnly />
      <UseReportConfigHookEffect />
      <section className="overflow-y-auto overflow-x-hidden w-full h-full flex flex-col p-3 md:p-5">
        <div className="flex flex-col md:flex-row gap-2 mb-4 w-full h-fit">
          <input
            type="text"
            placeholder="Cari ruangan, PIC, atau kampus..."
            className="w-full pl-4 pr-6 py-2 rounded-xl placeholder:text-white! outline-none bg-[#2b3440] text-white!"
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            onClick={() => setAddingRoom(true)}
            disabled={!canAdd}
            className="w-full md:w-max flex flex-row gap-2 items-center justify-center cursor-pointer duration-200 hover:brightness-75 bg-[#2b3440] text-white px-3 py-2 rounded-xl disabled:brightness-75 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="pi pi-plus"></i><p className="w-max">Tambah Ruangan</p>
          </button>
        </div>

        {showedRooms.length === 0 ? (
          <div className="text-white w-full h-full flex justify-center items-center">
            <p>{locationData.length === 0 ? "Tidak ada data ruangan yang tersedia." : "Tidak ada ruangan sesuai pencarian."}</p>
          </div>
        ) : (
          <>
          {/* Desktop: table */}
          <div className="hidden md:block h-full overflow-auto rounded-xl px-5 py-4 bg-[#374151]">
            <h2 className="text-2xl font-bold mb-4 text-white">Daftar Ruangan</h2>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="border-b border-[#F97316] text-white w-10">No.</th>
                  <th className="p-4 text-left border-b border-[#F97316] text-white">Ruangan</th>
                  <th className="p-4 text-left border-b border-[#F97316] text-white">Kampus</th>
                  <th className="p-4 text-left border-b border-[#F97316] text-white">PIC</th>
                  <th className="p-4 text-center border-b border-[#F97316] text-white">Action</th>
                </tr>
              </thead>
              <tbody>
                {showedRooms.map((room, index) => (
                  <tr key={room.id} className="border-b border-[#F97316] text-white font-semibold">
                    <td className="p-4 text-center">{index + 1}</td>
                    <td className="p-4 text-left">{room.location}</td>
                    <td className="p-4 text-left">{room.campus_name}</td>
                    <td className="p-4 text-left">{room.pic_name}</td>
                    <td className="p-4 text-center">
                      <div className="flex flex-row gap-2 justify-center">
                        <button onClick={() => openEdit(room)} className="cursor-pointer bg-blue-400 text-white px-4 py-1 rounded-xl duration-200 hover:brightness-75 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!canEdit}>
                          Edit PIC
                        </button>
                        <button onClick={() => openDelete(room)} className="cursor-pointer bg-red-500 text-white px-4 py-1 rounded-xl duration-200 hover:brightness-75 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!canDelete}>
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: one card per room */}
          <div className="md:hidden flex flex-col gap-4 w-full">
            <h2 className="text-xl font-bold text-white">Daftar Ruangan</h2>
            {showedRooms.map((room, index) => (
              <div key={room.id} className="flex flex-col gap-2 p-4 bg-[#374151] w-full rounded-2xl text-white">
                <p className="font-bold break-words">{index + 1}. {room.location}</p>
                <div className="flex flex-col gap-1 text-sm">
                  <p><span className="opacity-60">Kampus:</span> {room.campus_name}</p>
                  <p className="break-words"><span className="opacity-60">PIC:</span> {room.pic_name}</p>
                </div>
                <div className="flex flex-row gap-2 pt-2">
                  <button onClick={() => openEdit(room)} className="w-full cursor-pointer bg-blue-400 text-white px-4 py-2 rounded-xl duration-200 hover:brightness-75 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!canEdit}>
                    Edit PIC
                  </button>
                  <button onClick={() => openDelete(room)} className="w-full cursor-pointer bg-red-500 text-white px-4 py-2 rounded-xl duration-200 hover:brightness-75 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!canDelete}>
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </section>

      <PrimeReactProvider>
        <Dialog
          visible={editedRoom !== null}
          onHide={() => setEditedRoom(null)}
          className="w-[calc(100%-2rem)] max-w-xl mx-4 *:text-white!"
          headerClassName="bg-[#1a1d24]!"
          contentClassName="bg-[#1a1d24]!"
          header={`Edit PIC - ${editedRoom?.location ?? ""}`}
          draggable={false}
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="pic_name">Nama PIC</label>
              <input
                id="pic_name"
                type="text"
                maxLength={191}
                value={picName}
                onChange={(e) => setPicName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && handleSave()}
                className="w-full px-4 py-2 rounded-xl border border-gray-300 text-white!"
              />
              <p className="text-sm opacity-60">Laporan lama di ruangan ini juga akan memakai PIC baru.</p>
            </div>
            <div className="flex flex-row gap-4 justify-end">
              <button onClick={() => setEditedRoom(null)} className="cursor-pointer px-4 py-2 border border-gray-300 rounded-lg">
                Batal
              </button>
              <button onClick={handleSave} disabled={loading} className="flex flex-row items-center cursor-pointer px-4 py-2 bg-[#1f324d] text-white rounded-lg disabled:opacity-50">
                Simpan
                {loading && <i className="ml-2 pi pi-spinner pi-spin" />}
              </button>
            </div>
          </div>
        </Dialog>

        <Dialog
          visible={addingRoom}
          onHide={() => setAddingRoom(false)}
          className="w-[calc(100%-2rem)] max-w-xl mx-4 *:text-white!"
          headerClassName="bg-[#1a1d24]!"
          contentClassName="bg-[#1a1d24]!"
          header="Tambah Ruangan"
          draggable={false}
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="new_location">Nama Ruangan</label>
              <input
                id="new_location"
                type="text"
                maxLength={191}
                value={newRoom.location}
                onChange={(e) => setNewRoom({ ...newRoom, location: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-gray-300 text-white!"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label>Kampus</label>
              <DropdownComponent
                label="Kampus"
                value={newRoom.campus_name}
                onChange={(e) => setNewRoom({ ...newRoom, campus_name: e.value })}
                options={Object.values(Campus)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="new_pic_name">Nama PIC</label>
              <input
                id="new_pic_name"
                type="text"
                maxLength={191}
                value={newRoom.pic_name}
                onChange={(e) => setNewRoom({ ...newRoom, pic_name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && !addingLoading && handleAdd()}
                className="w-full px-4 py-2 rounded-xl border border-gray-300 text-white!"
              />
            </div>
            <div className="flex flex-row gap-4 justify-end">
              <button onClick={() => setAddingRoom(false)} className="cursor-pointer px-4 py-2 border border-gray-300 rounded-lg">
                Batal
              </button>
              <button onClick={handleAdd} disabled={addingLoading} className="flex flex-row items-center cursor-pointer px-4 py-2 bg-[#1f324d] text-white rounded-lg disabled:opacity-50">
                Tambah
                {addingLoading && <i className="ml-2 pi pi-spinner pi-spin" />}
              </button>
            </div>
          </div>
        </Dialog>

        <Dialog
          visible={deletedRoom !== null}
          onHide={() => setDeletedRoom(null)}
          className="w-[calc(100%-2rem)] max-w-xl mx-4 *:text-white!"
          headerClassName="bg-[#1a1d24]!"
          contentClassName="bg-[#1a1d24]!"
          header={`Hapus Ruangan - ${deletedRoom?.location ?? ""}`}
          draggable={false}
        >
          <div className="space-y-4">
            <p>
              Semua laporan di ruangan ini ({reportData?.filter((report) => report.location_name === deletedRoom?.location).length ?? 0} laporan) beserta fotonya akan ikut terhapus permanen. Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="flex flex-col gap-2">
              <label htmlFor="delete_confirm">Ketik <b>{deletedRoom?.location}</b> untuk konfirmasi</label>
              <input
                id="delete_confirm"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-gray-300 text-white!"
              />
            </div>
            <div className="flex flex-row gap-4 justify-end">
              <button onClick={() => setDeletedRoom(null)} className="cursor-pointer px-4 py-2 border border-gray-300 rounded-lg">
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={deletingLoading || deleteConfirmText !== deletedRoom?.location}
                className="flex flex-row items-center cursor-pointer px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Hapus
                {deletingLoading && <i className="ml-2 pi pi-spinner pi-spin" />}
              </button>
            </div>
          </div>
        </Dialog>
      </PrimeReactProvider>
    </>
  );
}
