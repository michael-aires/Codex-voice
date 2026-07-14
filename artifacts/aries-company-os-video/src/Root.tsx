import "./index.css";
import { AriesCompanyOSComposition } from "./Composition";
import { AriesCompanyOSDemoComposition } from "./DemoComposition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <AriesCompanyOSComposition />
      <AriesCompanyOSDemoComposition />
    </>
  );
};
