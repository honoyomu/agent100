import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export function ConfirmDeleteDialog({
  names,
  open,
  onOpenChange,
  onConfirm,
}: {
  names: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const title = names.length === 1 ? `Delete ${names[0]}?` : `Delete ${names.length} agents?`
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {names.length > 1 && <span className="mb-2 block font-mono text-xs">{names.join(', ')}</span>}
            Their machines and everything on them, including /data/workspace, will be permanently deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
