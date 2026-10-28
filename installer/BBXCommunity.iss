#define AppName "BBX Broadcast Studio — Community"
#define AppVersion "1.0.1"
#define AppPublisher "BBX Broadcast Studio"
#define AppExe "START-BBX-COMMUNITY.bat"
[Setup]
AppId={{91F52AF2-0D40-4B37-83DC-AD3706C7B009}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppVerName=BBX Broadcast Studio Community v{#AppVersion}
DefaultDirName={localappdata}\Programs\BBX Community
DefaultGroupName=BBX Broadcast Studio
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=BBX-Community-v1.0.1-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=BBX Community v{#AppVersion}
ArchitecturesAllowed=x64compatible
CloseApplications=yes
DisableProgramGroupPage=yes

[Files]
Source: "..\runtime\node.exe"; DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "..\server.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\START-BBX-COMMUNITY.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\BBX Community"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Comment: "Launch the BBX live broadcast controller"
Name: "{autodesktop}\BBX Community"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Tasks: desktopicon

[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Run]
Filename: "{app}\{#AppExe}"; Description: "Launch BBX Community"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent shellexec
