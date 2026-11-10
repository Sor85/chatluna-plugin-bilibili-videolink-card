import { useId } from 'react'
import { useTranslate } from '@chatluna/ui-client/client'
import { Checkbox, Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from '@chatluna/ui-kit'
import { extensionProps, type SchemaRendererProps } from '@chatluna/ui-schema-form/client'

export function OutputsField(props: SchemaRendererProps) {
  const id = useId()
  const t = useTranslate('bilibili-videolink-card')
  const current: unknown = props.value ?? props.schema.meta.default
  const values: string[] = Array.isArray(current) ? current.filter((item): item is string => typeof item === 'string') : []
  return (
    <div className="min-w-0 text-sm leading-5" data-bilibili-outputs="">
      {extensionProps(props, (
        <div className="grid gap-2 sm:grid-cols-2">
          {['card', 'video', 'link', 'log'].map((output) => {
            const controlId = `${id}-${output}`
            return (
              <FieldLabel key={output} htmlFor={controlId}>
                <Field orientation="horizontal">
                  <Checkbox
                    id={controlId}
                    aria-describedby={`${controlId}-description`}
                    checked={values.includes(output)}
                    onCheckedChange={(checked) => props.onChange(checked === true
                      ? [...new Set([...values, output])]
                      : values.filter((value) => value !== output))}
                  />
                  <FieldContent className="min-w-0">
                    <FieldTitle>{t(`${output}.title`)}</FieldTitle>
                    <FieldDescription id={`${controlId}-description`}>{t(`${output}.description`)}</FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>
            )
          })}
        </div>
      ), true)}
    </div>
  )
}
