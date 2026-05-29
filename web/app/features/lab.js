export function createLabFeatureModel(projectGraph = {}) {
  const plans = Array.isArray(projectGraph.reproductionPlans) ? projectGraph.reproductionPlans : [];
  const experimentRuns = Array.isArray(projectGraph.experimentRuns) ? projectGraph.experimentRuns : [];
  const dossiers = Array.isArray(projectGraph.resultDossiers) ? projectGraph.resultDossiers : [];
  const readingPackets = Array.isArray(projectGraph.readingPackets) ? projectGraph.readingPackets : [];
  const plan = plans[0] || null;
  const sourcePacket = readingPackets.find((packet) => packet.id === plan?.readingPacketId) || readingPackets[0] || null;

  return {
    dossiers,
    experimentRuns,
    plan,
    plans,
    readingPackets,
    sourcePacket,
  };
}
