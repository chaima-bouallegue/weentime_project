[xml]$xml = Get-Content "target\site\jacoco\jacoco.xml"
foreach ($pkg in $xml.report.package) {
    foreach ($sf in $pkg.sourcefile) {
        $lineCounter = $sf.counter | Where-Object { $_.type -eq 'LINE' }
        if ($lineCounter) {
            $missed = [int]$lineCounter.missed
            $covered = [int]$lineCounter.covered
            $total = $missed + $covered
            if ($total -gt 0) {
                $pct = [math]::Round($covered / $total * 100, 1)
                Write-Output ("{0,3}/{1,3} = {2,5}% - {3}" -f $covered, $total, $pct, $sf.name)
            }
        }
    }
}
