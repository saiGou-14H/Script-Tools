export const attractionFixtures = [
  {
    id: "westlake",
    city: "杭州",
    title: "西湖博物馆",
    open: true,
    ticketMinor: "0",
    description: "示例景点，支持使用脚本服务完成预约等操作。",
  },
  {
    id: "beijing",
    city: "北京",
    title: "城市历史馆",
    open: true,
    ticketMinor: "0",
    description: "示例景点，提供按次使用的预约服务。",
  },
  {
    id: "suzhou",
    city: "苏州",
    title: "城市展览馆",
    open: false,
    ticketMinor: "0",
    description: "示例景点，当前暂未开放脚本服务接入。",
  },
];

export function readTravelContext(params: URLSearchParams, prototype: boolean) {
  const attractionId =
    params.get("attraction") || (prototype ? "westlake" : undefined);
  const attraction = prototype
    ? attractionFixtures.find((item) => item.id === attractionId)
    : undefined;
  const date = params.get("date") || (prototype ? "2026-11-20" : "");
  const slot = params.get("slot") || (prototype ? "上午" : "");
  const partySize = params.get("party_size") || (prototype ? "1" : "");
  const validDate =
    !date ||
    (/^\d{4}-\d{2}-\d{2}$/.test(date) &&
      !Number.isNaN(Date.parse(date)) &&
      new Date(date).toISOString().slice(0, 10) === date);
  const invalid =
    (prototype && Boolean(attractionId) && !attraction) ||
    !validDate ||
    slot.length > 100 ||
    Boolean(
      partySize &&
      (!/^[1-9]\d*$/.test(partySize) ||
        !Number.isSafeInteger(Number(partySize))),
    );
  const context = new URLSearchParams();
  for (const [key, value] of Object.entries({
    attraction: attractionId,
    date,
    slot,
    party_size: partySize,
  })) {
    if (value) context.set(key, value);
  }
  return { attraction, date, slot, partySize, context, invalid };
}
