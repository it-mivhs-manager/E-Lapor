import { useEffect } from "react";
import { create } from "zustand";
import { APIResultType, getFormConfiguration, type FormConfigurationResponse } from "../../utils/api_interface";
import type { Report_Location } from "../../types/variables";
import { useCampusDataHook } from "../pages/ReportForm/useCampusData";
import { useMessageToastHook } from "./useMessageToast";
import { useNetworkConnectivityHook } from "./useNetworkConnectivity";

type useReportConfigType = {
  locationData: Report_Location[];
  setLocationData: (newLocationData: Report_Location[]) => void;

  picNamesOptions: string[];
  locationOptions: { [key: string]: string[] }
};

function derive_location_data(locationData: Report_Location[]) {
  const locationOptions: { [key: string]: string[] } = {};
  locationData.forEach((value) => {
    locationOptions[value.campus_name] ??= [];
    locationOptions[value.campus_name].push(value.location);
  });

  return {
    locationData,
    picNamesOptions: [...new Set(locationData.map((value) => value.pic_name))],
    locationOptions
  };
}

export const useReportConfigHook = create<useReportConfigType>((set) => {
  return {
    locationData: [],
    setLocationData(newLocationData) {
      set(() => derive_location_data(newLocationData));
    },

    // PIC names options
    picNamesOptions: [],

    // Location options
    locationOptions: {},
  };
});


let initialized = false;

export default function UseReportConfigHookEffect(props: { useAllCampus?: boolean }) {
  const { selectedCampus } = useCampusDataHook();
  const { setLocationData } = useReportConfigHook();
  const { showMessage } = useMessageToastHook();
  const { isConnected } = useNetworkConnectivityHook();

  useEffect(() => {
    if(initialized || !isConnected) {
      return;
    }
    initialized = true;
    
    // If not used all campus is not selected yet
    if (!props.useAllCampus && !selectedCampus) {
      return;
    }

    // Get Form Configuration
    getFormConfiguration().then((result) => {
      if ((result as FormConfigurationResponse).location_data !== undefined) {
        setLocationData((result as FormConfigurationResponse).location_data);
      } else if (result === APIResultType.DatabaseError) {
        showMessage("There's an error in database.", "error", "Please reload the website after a while.");
      } else if (result === false) {
        showMessage("There's a network error.", "error", "Please reload the website once you connected.");
      }
    }).catch(() => {
      showMessage("There's a network error.", "error", "Please reload the website once you connected.");
    });
  }, [selectedCampus]);

  return <></>;
}
