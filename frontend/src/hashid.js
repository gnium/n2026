import Sqids from "sqids";

const sqids = new Sqids({ minLength: 6 });

export const encId = (id) => sqids.encode([Number(id)]);
export const decId = (hash) => {
  if (!hash) return null;
  const nums = sqids.decode(hash);
  return nums.length ? nums[0] : null;
};
