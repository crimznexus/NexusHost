# Draws an original 64x64 pixel-art server icon: night sky, isometric grass block and short text (-Text).
# Output: server-icon.png (64x64) plus a 512x512 preview.
param([string]$Out = "$PSScriptRoot\..\server\server-icon.png", [string]$Preview = "$PSScriptRoot\..\server\server-icon-preview.png", [string]$Text = 'NEXUS')
Add-Type -AssemblyName System.Drawing
$Size = 64
$bmp = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
function C($r, $g, $b) { [System.Drawing.Color]::FromArgb(255, [Math]::Max(0,[Math]::Min(255,[int]$r)), [Math]::Max(0,[Math]::Min(255,[int]$g)), [Math]::Max(0,[Math]::Min(255,[int]$b))) }
function Hash([int]$x, [int]$y, [int]$s) { $h = ($x * 374761393 + $y * 668265263 + $s * 982451653) -band 0x7fffffff; $h = (($h -bxor ($h -shr 13)) * 1274126177) -band 0x7fffffff; ($h % 1000) / 1000.0 }

# 1. Background: night-sky gradient with stars
for ($y = 0; $y -lt $Size; $y++) {
  $t = $y / ($Size - 1)
  for ($x = 0; $x -lt $Size; $x++) { $bmp.SetPixel($x, $y, (C (20 + 40*$t) (24 + 10*$t) (60 + 50*$t))) }
}
$stars = @(@(5,4),@(12,9),@(55,5),@(48,11),@(7,20),@(58,24),@(3,33),@(60,38),@(20,3),@(40,2))
foreach ($s in $stars) { $bmp.SetPixel($s[0], $s[1], (C 255 250 200)) }
foreach ($s in @(@(55,5),@(12,9))) { foreach ($d in @(@(1,0),@(-1,0),@(0,1),@(0,-1))) { $bmp.SetPixel($s[0]+$d[0], $s[1]+$d[1], (C 150 150 190)) } }

# 2. Isometric block
$cx = 32; $top = 5; $hw = 19; $hh = 10; $h = 20
$T = @(@($cx,$top), @(($cx+$hw),($top+$hh)), @($cx,($top+2*$hh)), @(($cx-$hw),($top+$hh)))   # top diamond
$L = @(@(($cx-$hw),($top+$hh)), @($cx,($top+2*$hh)), @($cx,($top+2*$hh+$h)), @(($cx-$hw),($top+$hh+$h)))
$R = @(@($cx,($top+2*$hh)), @(($cx+$hw),($top+$hh)), @(($cx+$hw),($top+$hh+$h)), @($cx,($top+2*$hh+$h)))
function Inside($poly, [double]$px, [double]$py) {
  $sign = 0
  for ($i = 0; $i -lt 4; $i++) {
    $a = $poly[$i]; $b = $poly[($i+1) % 4]
    $cr = ($b[0]-$a[0])*($py-$a[1]) - ($b[1]-$a[1])*($px-$a[0])
    if ($cr -ne 0) { $s = [Math]::Sign($cr); if ($sign -eq 0) { $sign = $s } elseif ($s -ne $sign) { return $false } }
  }
  $true
}
$grass = @((C 92 168 60), (C 108 186 70), (C 78 148 50), (C 120 196 82))
$dirt  = @((C 134 94 62), (C 118 82 52), (C 150 106 70), (C 104 72 46))
for ($y = 0; $y -lt $Size; $y++) {
  for ($x = 0; $x -lt $Size; $x++) {
    $px = $x + 0.5; $py = $y + 0.5
    if (Inside $T $px $py) {
      $nz = Hash ([int][Math]::Floor($x/3)) ([int][Math]::Floor($y/2)) 1
      $col = $grass[[int]($nz * 4) % 4]
      $bmp.SetPixel($x, $y, $col)
    } elseif ((Inside $L $px $py) -or (Inside $R $px $py)) {
      $left = Inside $L $px $py
      # depth below the top edge of this face
      if ($left) { $edgeY = $top + $hh + ($x - ($cx - $hw)) * $hh / $hw } else { $edgeY = $top + 2*$hh - ($x - $cx) * $hh / $hw }
      $depth = $py - $edgeY
      $drip = 3 + [int]((Hash $x 0 7) * 4)
      $nz = Hash ([int][Math]::Floor($x/2)) ([int][Math]::Floor($depth/3)) 3
      if ($depth -lt $drip) { $col = $grass[[int]($nz * 4) % 4] } else { $col = $dirt[[int]($nz * 4) % 4] }
      $shade = 0.72; if (-not $left) { $shade = 0.9 }   # left face darker: light from the right
      $bmp.SetPixel($x, $y, (C ($col.R*$shade) ($col.G*$shade) ($col.B*$shade)))
    }
  }
}
# Outline and highlight edges
function Line($x0, $y0, $x1, $y1, $col) {
  $steps = [Math]::Max([Math]::Abs($x1-$x0), [Math]::Abs($y1-$y0))
  for ($i = 0; $i -le $steps; $i++) { $x = [int][Math]::Round($x0 + ($x1-$x0)*$i/$steps); $y = [int][Math]::Round($y0 + ($y1-$y0)*$i/$steps); if ($x -ge 0 -and $x -lt $Size -and $y -ge 0 -and $y -lt $Size) { $bmp.SetPixel($x, $y, $col) } }
}
$ol = C 22 20 30
Line $T[0][0] $T[0][1] $T[1][0] $T[1][1] $ol; Line $T[0][0] $T[0][1] $T[3][0] $T[3][1] $ol
Line $T[1][0] $T[1][1] $R[2][0] $R[2][1] $ol; Line $T[3][0] $T[3][1] $L[3][0] $L[3][1] $ol
Line $L[3][0] $L[3][1] $L[2][0] $L[2][1] $ol; Line $R[2][0] $R[2][1] $R[3][0] $R[3][1] $ol
$hl = C 170 225 120
Line ($T[3][0]+1) $T[3][1] ($T[2][0]) ($T[2][1]-1) $hl; Line $T[2][0] ($T[2][1]-1) ($T[1][0]-1) $T[1][1] $hl
Line $T[2][0] ($T[2][1]) $R[3][0] ($R[3][1]-1) (C 60 44 30)

# 3. Text (pixel font, 2x scale, dark outline)
$font = @{
  'A' = @('.#.','#.#','###','#.#','#.#'); 'B' = @('##.','#.#','##.','#.#','##.'); 'C' = @('.##','#..','#..','#..','.##')
  'D' = @('##.','#.#','#.#','#.#','##.'); 'E' = @('###','#..','##.','#..','###'); 'F' = @('###','#..','##.','#..','#..')
  'G' = @('.##','#..','#.#','#.#','.##'); 'H' = @('#.#','#.#','###','#.#','#.#'); 'I' = @('###','.#.','.#.','.#.','###')
  'J' = @('..#','..#','..#','#.#','.#.'); 'K' = @('#.#','#.#','##.','#.#','#.#'); 'L' = @('#..','#..','#..','#..','###')
  'M' = @('#...#','##.##','#.#.#','#...#','#...#'); 'N' = @('#..#','##.#','#.##','#..#','#..#'); 'O' = @('.#.','#.#','#.#','#.#','.#.')
  'P' = @('##.','#.#','##.','#..','#..'); 'Q' = @('.#.','#.#','#.#','##.','.##'); 'R' = @('##.','#.#','##.','#.#','#.#')
  'S' = @('.##','#..','.#.','..#','##.'); 'T' = @('###','.#.','.#.','.#.','.#.'); 'U' = @('#.#','#.#','#.#','#.#','###')
  'V' = @('#.#','#.#','#.#','#.#','.#.'); 'W' = @('#...#','#...#','#.#.#','##.##','#...#'); 'X' = @('#.#','#.#','.#.','#.#','#.#')
  'Y' = @('#.#','#.#','.#.','.#.','.#.'); 'Z' = @('###','..#','.#.','#..','###')
  '0' = @('###','#.#','#.#','#.#','###'); '1' = @('.#.','##.','.#.','.#.','###'); '2' = @('##.','..#','.#.','#..','###')
  '3' = @('##.','..#','.#.','..#','##.'); '4' = @('#.#','#.#','###','..#','..#'); '5' = @('###','#..','##.','..#','##.')
  '6' = @('.##','#..','###','#.#','###'); '7' = @('###','..#','.#.','.#.','.#.'); '8' = @('###','#.#','###','#.#','###')
  '9' = @('###','#.#','###','..#','##.'); ' ' = @('..','..','..','..','..'); '-' = @('...','...','###','...','...')
}
$sc = 2; $gap = 2
$glyphs = [System.Collections.Generic.List[object]]::new()
foreach ($ch in $Text.ToUpper().ToCharArray()) { if (-not $font.ContainsKey("$ch")) { throw "make-icon: character '$ch' is not supported (use A-Z, 0-9, space, -)" }; $glyphs.Add([string[]]$font["$ch"]) }
$width = ($glyphs | ForEach-Object { $_[0].Length * $sc } | Measure-Object -Sum).Sum + $gap * ($glyphs.Count - 1)
if ($width -gt $Size - 2) { throw "make-icon: '$Text' is too wide for a 64x64 icon. Use about 6 characters or fewer." }
$tx = [int](($Size - $width) / 2); $ty = 50
$mask = New-Object 'bool[,]' $Size, $Size
$x0 = $tx
foreach ($g in $glyphs) {
  for ($row = 0; $row -lt 5; $row++) { for ($c = 0; $c -lt $g[$row].Length; $c++) { if ($g[$row][$c] -eq '#') {
    for ($dy = 0; $dy -lt $sc; $dy++) { for ($dx = 0; $dx -lt $sc; $dx++) { $mask[($x0 + $c*$sc + $dx), ($ty + $row*$sc + $dy)] = $true } } } } }
  $x0 += $g[0].Length * $sc + $gap
}
for ($y = 0; $y -lt $Size; $y++) { for ($x = 0; $x -lt $Size; $x++) { if (-not $mask[$x,$y]) {
  $near = $false; foreach ($d in @(@(1,0),@(-1,0),@(0,1),@(0,-1),@(1,1))) { $nx = $x-$d[0]; $ny = $y-$d[1]; if ($nx -ge 0 -and $ny -ge 0 -and $nx -lt $Size -and $ny -lt $Size -and $mask[$nx,$ny]) { $near = $true } }
  if ($near) { $bmp.SetPixel($x, $y, (C 15 12 25)) } } } }
for ($y = 0; $y -lt $Size; $y++) { for ($x = 0; $x -lt $Size; $x++) { if ($mask[$x,$y]) {
  $t = ($y - $ty) / (5*$sc); $bmp.SetPixel($x, $y, (C (255) (230 - 70*$t) (90 - 60*$t))) } } }

$outPath = [IO.Path]::GetFullPath($Out)
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
# Preview, scaled up 8x with hard pixel edges
$pv = New-Object System.Drawing.Bitmap 512, 512
$g = [System.Drawing.Graphics]::FromImage($pv)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.DrawImage($bmp, 0, 0, 512, 512); $g.Dispose()
$pv.Save([IO.Path]::GetFullPath($Preview), [System.Drawing.Imaging.ImageFormat]::Png)
$pv.Dispose(); $bmp.Dispose()
"saved $outPath"
