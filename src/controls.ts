/** Axure.DocumentModel.Objects.InputType, in serialized enum order. */
export const inputTypes = ['text','password','email','number','tel','url','search','checkbox','radio','button','submit','reset','file','hidden','image','datetime','datetime-local','date','month','time','week','range','color'] as const;
export type InputType = typeof inputTypes[number];
