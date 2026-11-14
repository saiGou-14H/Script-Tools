# Requires PowerShell 7.4+ and Test-Json. Does not execute scripts or send HTTP requests.
$ErrorActionPreference = 'Stop'
$contractRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'contracts'
$exampleRoot = Join-Path $contractRoot 'examples'
$script:checkCount = 0

function Read-ContractJson([string]$Path) {
    Get-Content -LiteralPath $Path -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -Depth 100
}
function Copy-ContractValue($Value) {
    ConvertTo-Json -InputObject $Value -Depth 100 -Compress | ConvertFrom-Json -AsHashtable -Depth 100
}
function Assert-Contract([bool]$Condition, [string]$Label) {
    if (-not $Condition) { throw "Contract check failed: $Label" }
    $script:checkCount++
}
function Check-Schema($Value, $Schema, [bool]$Expected, [string]$Label) {
    $valueJson = ConvertTo-Json -InputObject $Value -Depth 100 -Compress
    $schemaJson = ConvertTo-Json -InputObject $Schema -Depth 100 -Compress
    $actual = Test-Json -Json $valueJson -Schema $schemaJson -ErrorAction SilentlyContinue
    Assert-Contract ($actual -eq $Expected) $Label
}
function Check-ManifestRelations($Manifest) {
    Assert-Contract ($Manifest.actions.Contains($Manifest.default_action)) 'default_action registered'
    foreach ($actionName in $Manifest.actions.Keys) {
        $actionSpec = $Manifest.actions[$actionName]
        foreach ($resumeName in $actionSpec.resume_actions) {
            Assert-Contract ($Manifest.actions.Contains($resumeName)) 'resume action registered'
        }
    }
    foreach ($packagePath in @($Manifest.entrypoint, $Manifest.dependencies_lock)) {
        Assert-Contract (-not [IO.Path]::IsPathRooted($packagePath) -and $packagePath -notmatch '(^|[/\\])\.\.([/\\]|$)') 'package path bounded'
    }
}

$schemas = @{}
foreach ($kind in @('manifest', 'invocation', 'result', 'script-event', 'output', 'output-batch')) {
    $schemas[$kind] = Read-ContractJson (Join-Path $contractRoot "$kind.schema.json")
}
$cases = Read-ContractJson (Join-Path $exampleRoot 'cases.json')
foreach ($caseSpec in $cases) {
    $manifest = Read-ContractJson (Join-Path $exampleRoot $caseSpec.manifest)
    Check-Schema $manifest $schemas.manifest $true "$($caseSpec.id): manifest"
    Check-ManifestRelations $manifest
    if (-not $caseSpec.invocation) { continue }
    $invocation = Read-ContractJson (Join-Path $exampleRoot $caseSpec.invocation)
    Check-Schema $invocation $schemas.invocation $true "$($caseSpec.id): invocation"
    Assert-Contract ($manifest.actions.Contains($invocation.action)) 'invoked action registered'
    $actionSpec = $manifest.actions[$invocation.action]
    $effectiveSchema = if ($actionSpec.Contains('input_schema')) { $actionSpec.input_schema } else { $manifest.input_schema }
    Check-Schema $invocation.input $effectiveSchema $true "$($caseSpec.id): publisher input"
    $result = Read-ContractJson (Join-Path $exampleRoot $caseSpec.result)
    Check-Schema $result $schemas.result $true "$($caseSpec.id): result envelope"
    foreach ($key in @('run_id', 'attempt_id', 'invocation_id', 'action')) {
        Assert-Contract ($result[$key] -eq $invocation[$key]) "result association: $key"
    }
    if ($result.outcome -eq 'COMPLETED' -or $null -ne $result.data) {
        Check-Schema $result.data $actionSpec.output_schema $true "$($caseSpec.id): publisher output"
    }
    if ($result.outcome -eq 'ACTION_REQUIRED' -and $null -ne $result.action_required.resume_action) {
        Assert-Contract ($actionSpec.resume_actions -contains $result.action_required.resume_action) 'resume action allowed'
    }
    if ($caseSpec.event) {
        $eventPayload = Read-ContractJson (Join-Path $exampleRoot $caseSpec.event)
        Check-Schema $eventPayload $schemas.'script-event' $true 'event envelope'
        foreach ($key in @('run_id', 'attempt_id', 'invocation_id', 'script_version_id')) {
            Assert-Contract ($eventPayload[$key] -eq $invocation[$key]) "event association: $key"
        }
        Assert-Contract ($manifest.events.Contains($eventPayload.event_name)) 'event registered'
        Check-Schema $eventPayload.data $manifest.events[$eventPayload.event_name].data_schema $true 'event data'
    }
}

$report = Read-ContractJson (Join-Path $exampleRoot 'report.manifest.json')
$bad = Copy-ContractValue $report
$bad.Remove('input_schema') | Out-Null
Check-Schema $bad $schemas.manifest $false 'reject missing publisher schema'
$bad = Copy-ContractValue $report
$bad.actions.summarize_records.Remove('output_schema') | Out-Null
Check-Schema $bad $schemas.manifest $false 'reject missing hooks output schema'
$bad = Copy-ContractValue $report
$bad.hooks['reserve_ticket'] = 'reserve_ticket'
Check-Schema $bad $schemas.manifest $false 'business action is not a lifecycle hook'
$bad = Copy-ContractValue $report
$bad.supported_execution_modes = @('browser')
Check-Schema $bad $schemas.manifest $false 'reject unsupported execution mode'
Check-Schema @{limit=10} $report.input_schema $false 'reject missing source_url'
Check-Schema @{source_url='https://api.example.invalid/records';limit='10'} $report.input_schema $false 'reject implicit type conversion'
Check-Schema @{source_url='https://api.example.invalid/records';channel_id='unexpected'} $report.input_schema $false 'reject undocumented extra input'
$reportResult = Read-ContractJson (Join-Path $exampleRoot 'report.result.json')
$bad = Copy-ContractValue $reportResult
$bad.outcome = 'ACTION_REQUIRED'
Check-Schema $bad $schemas.result $false 'reject missing action_required'
$bad = Copy-ContractValue $reportResult
$bad.outcome = 'ERROR'
Check-Schema $bad $schemas.result $false 'reject missing error'
$bad = Copy-ContractValue $reportResult
$bad['owner_user_id'] = 'forged'
Check-Schema $bad $schemas.result $false 'reject script-owned platform metadata'
Check-Schema @{item_count='one';records=@()} $report.actions.summarize_records.output_schema $false 'reject wrong output type'
$batch = Read-ContractJson (Join-Path $exampleRoot 'batch.manifest.json')
$confirm = Read-ContractJson (Join-Path $exampleRoot 'confirm.invocation.json')
Check-Schema $confirm.input $batch.input_schema $false 'action input override is not an implicit merge'
$invalidEvent = Read-ContractJson (Join-Path $exampleRoot 'report.event.json')
$invalidEvent['recipient_email'] = 'someone@example.invalid'
Check-Schema $invalidEvent $schemas.'script-event' $false 'reject arbitrary event recipient'
$errorResult = Copy-ContractValue $reportResult
$errorResult.outcome = 'ERROR'
$errorResult.data = $null
$errorResult.error = @{code='DEMO_ERROR';message='Synthetic failure'}
Check-Schema $errorResult $schemas.result $true 'valid error envelope'
$arrayManifest = Copy-ContractValue $report
$arrayManifest.input_schema = @{type='array';items=@{type='integer'};minItems=1}
Check-Schema $arrayManifest $schemas.manifest $true 'publisher may define array input'
$arrayInvocation = Read-ContractJson (Join-Path $exampleRoot 'report.invocation.json')
$arrayInvocation.input = @(1,2)
Check-Schema $arrayInvocation $schemas.invocation $true 'envelope does not force object input'
Check-Schema $arrayInvocation.input $arrayManifest.input_schema $true 'array input follows publisher schema'
Check-Schema @{} @{type='object';maxProperties=0} $true 'explicit no-parameter input'
Check-Schema @{unexpected=1} @{type='object';maxProperties=0} $false 'no-parameter input rejects undeclared content'
foreach ($caseSpec in $cases) {
    if (-not $caseSpec.output_items) { continue }
    $items = Read-ContractJson (Join-Path $exampleRoot $caseSpec.output_items)
    foreach ($item in $items) { Check-Schema $item.request $schemas.output $true "output: $($item.output_id)" }
    $batches = if ($caseSpec.output_batches) { Read-ContractJson (Join-Path $exampleRoot $caseSpec.output_batches) } else { @(Read-ContractJson (Join-Path $exampleRoot $caseSpec.output_batch)) }
    foreach ($batchSpec in $batches) {
        Check-Schema $batchSpec $schemas.'output-batch' $true "batch: $($batchSpec.batch_key)"
        if ($batchSpec.checkpoint) {
            $batchManifest = Read-ContractJson (Join-Path $exampleRoot $caseSpec.manifest)
            $batchInvocation = Read-ContractJson (Join-Path $exampleRoot $caseSpec.invocation)
            Check-Schema $batchSpec.checkpoint.value $batchManifest.actions[$batchInvocation.action].checkpoint_schema $true 'publisher checkpoint schema'
        }
    }
}
$sampleItems = Read-ContractJson (Join-Path $exampleRoot 'outputs.items.json')
$fileItem = ($sampleItems | Where-Object { $_.request.kind -eq 'file' } | Select-Object -First 1).request
$messageItem = ($sampleItems | Where-Object { $_.request.kind -eq 'message' } | Select-Object -First 1).request
$bad = Copy-ContractValue $fileItem
$bad.payload.file_name = '../outside.pdf'
Check-Schema $bad $schemas.output $false 'reject traversal download name'
$bad = Copy-ContractValue $fileItem
$bad.payload.sha256 = 'not-a-digest'
Check-Schema $bad $schemas.output $false 'reject malformed file digest'
$bad = Copy-ContractValue $messageItem
$bad.payload.recipient_email = 'someone@example.invalid'
Check-Schema $bad $schemas.output $false 'reject arbitrary message recipient'
$bad = Copy-ContractValue $messageItem
$bad.payload.channel_binding_ids = @()
Check-Schema $bad $schemas.output $false 'empty channels do not mean all channels'
$bad = Copy-ContractValue $messageItem
$bad.payload.attachments = @(@{output_id='one'},@{output_id='one'})
Check-Schema $bad $schemas.output $false 'reject duplicate attachment reference'
$bad = Read-ContractJson (Join-Path $exampleRoot 'outputs.batch.json')
$bad.producer_outcome = 'FAILED'
Check-Schema $bad $schemas.'output-batch' $false 'failed producer must include error'
$bad = Read-ContractJson (Join-Path $exampleRoot 'outputs.batch.json')
$bad.checkpoint = @{value=@{cursor=1}}
Check-Schema $bad $schemas.'output-batch' $false 'checkpoint requires expected revision'
$continuousInvocation = Read-ContractJson (Join-Path $exampleRoot 'continuous.invocation.json')
Check-Schema $continuousInvocation $schemas.invocation $true 'continuous supports no fixed deadline'
$bad = Copy-ContractValue $continuousInvocation
$bad.runtime.run_mode = 'finite'
Check-Schema $bad $schemas.invocation $false 'finite still requires bounded deadlines'
$bad = Copy-ContractValue $continuousInvocation
$bad.runtime.Remove('lease_expires_at') | Out-Null
Check-Schema $bad $schemas.invocation $false 'continuous still requires current lease'
$bad = Read-ContractJson (Join-Path $exampleRoot 'continuous.manifest.json')
$bad.actions.watch_records.Remove('checkpoint_schema') | Out-Null
Check-Schema $bad $schemas.manifest $false 'resume handler requires checkpoint schema'
$checkpointManifest = Read-ContractJson (Join-Path $exampleRoot 'continuous.manifest.json')
Check-Schema @{cursor='one'} $checkpointManifest.actions.watch_records.checkpoint_schema $false 'checkpoint does not coerce publisher value'
$oldManifest = Copy-ContractValue $report
$oldManifest.schema_version = '1.0'
$oldManifest.hook_protocol_version = '1.0'
Check-Schema $oldManifest (Read-ContractJson (Join-Path $contractRoot 'v1.0/manifest.schema.json')) $true 'archived 1.0 manifest remains valid'
Check-Schema $oldManifest $schemas.manifest $false '1.0 is not silently validated as 2.0'
$adapterSchema = Read-ContractJson (Join-Path $contractRoot 'legacy-adapter.schema.json')
$emissionSchema = Read-ContractJson (Join-Path $contractRoot 'legacy-emission.schema.json')
$adapter = Read-ContractJson (Join-Path $exampleRoot 'mapped.adapter.json')
$mappedManifest = Read-ContractJson (Join-Path $exampleRoot 'mapped.manifest.json')
$mappedInput = Read-ContractJson (Join-Path $exampleRoot 'mapped.input.json')
$emission = Read-ContractJson (Join-Path $exampleRoot 'mapped.emission.json')
Check-Schema $mappedManifest $schemas.manifest $true 'mapped legacy keeps protocol 2.0'
Check-ManifestRelations $mappedManifest
Check-Schema $mappedInput $mappedManifest.input_schema $true 'mapped publisher input'
Check-Schema $adapter $adapterSchema $true 'adapter independent protocol 1.0'
Check-Schema $emission $emissionSchema $true 'local file handoff'
$bad = Copy-ContractValue $mappedInput
$bad.limit = '20'
Check-Schema $bad $mappedManifest.input_schema $false 'validate publisher type before encoding'
$bad = Copy-ContractValue $adapter
$bad.adapter_protocol_version = '2.0'
Check-Schema $bad $adapterSchema $false 'reject unnegotiated adapter version'
$bad = Copy-ContractValue $adapter
$bad.command = 'bash -c arbitrary'
Check-Schema $bad $adapterSchema $false 'no arbitrary shell command field'
$bad = Copy-ContractValue $adapter
$bad.argv = @(@{credential_alias='source_token';on_missing='error'})
Check-Schema $bad $adapterSchema $false 'no credential argv'
$bad = Copy-ContractValue $adapter
$bad.env.SOURCE_URL.input_pointer = '/source~2url'
Check-Schema $bad $adapterSchema $false 'malformed pointer escape'
$bad = Copy-ContractValue $adapter
$bad.env.SOURCE_URL.input_pointer = ''
Check-Schema $bad $adapterSchema $true 'root pointer allowed'
$bad = Copy-ContractValue $adapter
$bad.env.SOURCE_URL.fallback = 'hidden-default'
Check-Schema $bad $adapterSchema $false 'no implicit input defaults'
foreach ($name in @('PATH','HOME','NODE_OPTIONS','NODE_PATH','PYTHONPATH','PYTHONHOME','PYTHONSTARTUP','LD_PRELOAD','DYLD_INSERT_LIBRARIES','TT_TOKEN')) {
    $bad = Copy-ContractValue $adapter
    $bad.env[$name] = $bad.env.SOURCE_URL
    Check-Schema $bad $adapterSchema $false "reserved environment: $name"
}
foreach ($badPath in @('../outside','/absolute','C:/outside','a/../outside','a\outside','a//outside','a/')) {
    $bad = Copy-ContractValue $adapter
    $bad.config_files[0].path = $badPath
    Check-Schema $bad $adapterSchema $false "reject mapped path: $badPath"
}
$bad = Copy-ContractValue $adapter
$bad.config_files[0].path = '配置/报表.json'
Check-Schema $bad $adapterSchema $true 'Unicode mapped file paths'
$bad = Copy-ContractValue $adapter
$bad.outputs = @{mode='final';files=@(@{output_key='report';path='report.csv';media_type='text/csv'})}
Check-Schema $bad $adapterSchema $true 'final file collection'
$bad.outputs = @{mode='none'}
$bad.notification_bridge = @{mode='disabled'}
Check-Schema $bad $adapterSchema $true 'outputs and bridge optional capability'
$bad = Copy-ContractValue $adapter
$bad.outputs = @{mode='final';files=@()}
Check-Schema $bad $adapterSchema $false 'no empty final file collection'
$bad = Copy-ContractValue $adapter
$bad.notification_bridge.apis = @('python.QLAPI.getEnvs')
Check-Schema $bad $adapterSchema $false 'no global environment API bridge'
$bad = Copy-ContractValue $adapter
$bad.notification_bridge.recipient_email = 'somebody@example.invalid'
Check-Schema $bad $adapterSchema $false 'no arbitrary recipient bridge'
$bad = Copy-ContractValue $adapter
$bad.notification_bridge.apis = @('python.notify.send','python.notify.send')
Check-Schema $bad $adapterSchema $false 'duplicate bridge API rejected'
$bad = Copy-ContractValue $emission
$bad.files[0].sha256 = 'unknown'
Check-Schema $bad $emissionSchema $false 'handoff requires digest'
$bad = Copy-ContractValue $emission
$bad.files[0].size_bytes = 104857601
Check-Schema $bad $emissionSchema $false 'handoff file budget'
$bad = Copy-ContractValue $emission
$bad.files[0].path = '../secret'
Check-Schema $bad $emissionSchema $false 'handoff traversal rejected'
$bad = Copy-ContractValue $emission
$bad.checkpoint = @{cursor=1}
Check-Schema $bad $emissionSchema $false 'legacy handoff does not promise atomic checkpoint'
Write-Output "PASS: $script:checkCount contract checks; $($cases.Count) core example cases plus adapter examples. No business action, upload or notification executed."
