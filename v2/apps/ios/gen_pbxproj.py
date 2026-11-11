"""Writes Buad.xcodeproj from the files under BuadApp/ (same layout XcodeGen produces).
Run after adding or removing a Swift file: python3 gen_pbxproj.py — or use `xcodegen generate` on a Mac."""
import hashlib, os
ROOT = os.path.dirname(os.path.abspath(__file__))
def uid(*parts): return hashlib.md5("/".join(parts).encode()).hexdigest()[:24].upper()
groups = {}  # path -> children
files = []
for d, _, fs in os.walk(os.path.join(ROOT, "BuadApp")):
    rel = os.path.relpath(d, ROOT)
    if rel.endswith(".xcassets") or ".xcassets" in rel: continue
    for f in sorted(fs):
        if f.endswith(".swift"): files.append((rel, f, "sourcecode.swift"))
    for sub in sorted(os.listdir(d)):
        if sub.endswith(".xcassets"): files.append((rel, sub, "folder.assetcatalog"))
dirs = sorted({r for r, _, _ in files} | {"BuadApp"})
def parents(p):
    out = []
    while p and p != ".":
        out.append(p); p = os.path.dirname(p)
    return out
alld = sorted({q for p in dirs for q in parents(p)})
L = []; A = L.append
A("// !$*UTF8*$!\n{\n\tarchiveVersion = 1;\n\tclasses = {\n\t};\n\tobjectVersion = 77;\n\tobjects = {\n")
A("/* Begin PBXBuildFile section */")
for r, f, t in sorted(files, key=lambda x: x[1]):
    phase = "Resources" if t == "folder.assetcatalog" else "Sources"
    A(f"\t\t{uid('build', r, f)} /* {f} in {phase} */ = {{isa = PBXBuildFile; fileRef = {uid('ref', r, f)} /* {f} */; }};")
A("/* End PBXBuildFile section */\n\n/* Begin PBXFileReference section */")
A(f"\t\t{uid('product')} /* BuadApp.app */ = {{isa = PBXFileReference; includeInIndex = 0; lastKnownFileType = wrapper.application; path = BuadApp.app; sourceTree = BUILT_PRODUCTS_DIR; }};")
for r, f, t in sorted(files, key=lambda x: x[1]):
    A(f"\t\t{uid('ref', r, f)} /* {f} */ = {{isa = PBXFileReference; lastKnownFileType = {t}; path = {f}; sourceTree = \"<group>\"; }};")
A("/* End PBXFileReference section */\n\n/* Begin PBXGroup section */")
A(f"\t\t{uid('main')} = {{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n\t\t\t\t{uid('group','BuadApp')} /* BuadApp */,\n\t\t\t\t{uid('products')} /* Products */,\n\t\t\t);\n\t\t\tsourceTree = \"<group>\";\n\t\t}};")
A(f"\t\t{uid('products')} /* Products */ = {{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n\t\t\t\t{uid('product')} /* BuadApp.app */,\n\t\t\t);\n\t\t\tname = Products;\n\t\t\tsourceTree = \"<group>\";\n\t\t}};")
for g in alld:
    kids = [f"\t\t\t\t{uid('group', c)} /* {os.path.basename(c)} */," for c in alld if os.path.dirname(c) == g]
    kids += [f"\t\t\t\t{uid('ref', r, f)} /* {f} */," for r, f, t in files if r == g]
    A(f"\t\t{uid('group', g)} /* {os.path.basename(g)} */ = {{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n" + "\n".join(kids) + f"\n\t\t\t);\n\t\t\tpath = {os.path.basename(g)};\n\t\t\tsourceTree = \"<group>\";\n\t\t}};")
A("/* End PBXGroup section */\n\n/* Begin PBXNativeTarget section */")
T = uid('target')
A(f"\t\t{T} /* BuadApp */ = {{\n\t\t\tisa = PBXNativeTarget;\n\t\t\tbuildConfigurationList = {uid('tconf')} /* Build configuration list for PBXNativeTarget \"BuadApp\" */;\n\t\t\tbuildPhases = (\n\t\t\t\t{uid('sources')} /* Sources */,\n\t\t\t\t{uid('resources')} /* Resources */,\n\t\t\t);\n\t\t\tbuildRules = (\n\t\t\t);\n\t\t\tdependencies = (\n\t\t\t);\n\t\t\tname = BuadApp;\n\t\t\tpackageProductDependencies = (\n\t\t\t);\n\t\t\tproductName = BuadApp;\n\t\t\tproductReference = {uid('product')} /* BuadApp.app */;\n\t\t\tproductType = \"com.apple.product-type.application\";\n\t\t}};")
A("/* End PBXNativeTarget section */\n\n/* Begin PBXProject section */")
A(f"\t\t{uid('project')} /* Project object */ = {{\n\t\t\tisa = PBXProject;\n\t\t\tattributes = {{\n\t\t\t\tBuildIndependentTargetsInParallel = YES;\n\t\t\t\tLastUpgradeCheck = 1430;\n\t\t\t\tTargetAttributes = {{\n\t\t\t\t\t{T} = {{\n\t\t\t\t\t\tProvisioningStyle = Automatic;\n\t\t\t\t\t}};\n\t\t\t\t}};\n\t\t\t}};\n\t\t\tbuildConfigurationList = {uid('pconf')} /* Build configuration list for PBXProject \"Buad\" */;\n\t\t\tdevelopmentRegion = ar;\n\t\t\thasScannedForEncodings = 0;\n\t\t\tknownRegions = (\n\t\t\t\tBase,\n\t\t\t\tar,\n\t\t\t);\n\t\t\tmainGroup = {uid('main')};\n\t\t\tminimizedProjectReferenceProxies = 1;\n\t\t\tpreferredProjectObjectVersion = 77;\n\t\t\tproductRefGroup = {uid('products')} /* Products */;\n\t\t\tprojectDirPath = \"\";\n\t\t\tprojectRoot = \"\";\n\t\t\ttargets = (\n\t\t\t\t{T} /* BuadApp */,\n\t\t\t);\n\t\t}};")
A("/* End PBXProject section */\n\n/* Begin PBXResourcesBuildPhase section */")
res = "\n".join(f"\t\t\t\t{uid('build', r, f)} /* {f} in Resources */," for r, f, t in files if t == "folder.assetcatalog")
A(f"\t\t{uid('resources')} /* Resources */ = {{\n\t\t\tisa = PBXResourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n{res}\n\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t}};")
A("/* End PBXResourcesBuildPhase section */\n\n/* Begin PBXSourcesBuildPhase section */")
src = "\n".join(f"\t\t\t\t{uid('build', r, f)} /* {f} in Sources */," for r, f, t in sorted(files, key=lambda x: x[1]) if t == "sourcecode.swift")
A(f"\t\t{uid('sources')} /* Sources */ = {{\n\t\t\tisa = PBXSourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n{src}\n\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t}};")
A("/* End PBXSourcesBuildPhase section */\n\n/* Begin XCBuildConfiguration section */")
common = """ALWAYS_SEARCH_USER_PATHS = NO;
CLANG_ANALYZER_NONNULL = YES;
CLANG_CXX_LANGUAGE_STANDARD = "gnu++14";
CLANG_CXX_LIBRARY = "libc++";
CLANG_ENABLE_MODULES = YES;
CLANG_ENABLE_OBJC_ARC = YES;
CLANG_ENABLE_OBJC_WEAK = YES;
CLANG_WARN_UNGUARDED_AVAILABILITY = YES_AGGRESSIVE;
COPY_PHASE_STRIP = NO;
ENABLE_STRICT_OBJC_MSGSEND = YES;
GCC_C_LANGUAGE_STANDARD = gnu11;
GCC_NO_COMMON_BLOCKS = YES;
IPHONEOS_DEPLOYMENT_TARGET = 18.0;
MTL_FAST_MATH = YES;
PRODUCT_NAME = "$(TARGET_NAME)";
SDKROOT = iphoneos;
SWIFT_VERSION = 5.0;"""
debug = common + """
DEBUG_INFORMATION_FORMAT = dwarf;
ENABLE_TESTABILITY = YES;
GCC_DYNAMIC_NO_PIC = NO;
GCC_OPTIMIZATION_LEVEL = 0;
GCC_PREPROCESSOR_DEFINITIONS = (
	"$(inherited)",
	"DEBUG=1",
);
MTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE;
ONLY_ACTIVE_ARCH = YES;
SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;
SWIFT_OPTIMIZATION_LEVEL = "-Onone";"""
release = common + """
DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";
ENABLE_NS_ASSERTIONS = NO;
MTL_ENABLE_DEBUG_INFO = NO;
SWIFT_COMPILATION_MODE = wholemodule;
SWIFT_OPTIMIZATION_LEVEL = "-O";"""
target = """ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;
BUAD_API_BASE = "";
CODE_SIGN_IDENTITY = "iPhone Developer";
CODE_SIGN_STYLE = Automatic;
CURRENT_PROJECT_VERSION = 1;
INFOPLIST_FILE = BuadApp/Info.plist;
IPHONEOS_DEPLOYMENT_TARGET = 18.0;
LD_RUNPATH_SEARCH_PATHS = (
	"$(inherited)",
	"@executable_path/Frameworks",
);
MARKETING_VERSION = 0.8.1;
PRODUCT_BUNDLE_IDENTIFIER = sa.buad.app;
PRODUCT_NAME = BuadApp;
SDKROOT = iphoneos;
TARGETED_DEVICE_FAMILY = 1;"""
def conf(key, name, body):
    ind = "\n".join("\t\t\t\t" + l for l in body.split("\n"))
    return f"\t\t{uid(key)} /* {name} */ = {{\n\t\t\tisa = XCBuildConfiguration;\n\t\t\tbuildSettings = {{\n{ind}\n\t\t\t}};\n\t\t\tname = {name};\n\t\t}};"
A(conf('pdebug', 'Debug', debug)); A(conf('prelease', 'Release', release))
A(conf('tdebug', 'Debug', target)); A(conf('trelease', 'Release', target))
A("/* End XCBuildConfiguration section */\n\n/* Begin XCConfigurationList section */")
A(f"\t\t{uid('tconf')} /* Build configuration list for PBXNativeTarget \"BuadApp\" */ = {{\n\t\t\tisa = XCConfigurationList;\n\t\t\tbuildConfigurations = (\n\t\t\t\t{uid('tdebug')} /* Debug */,\n\t\t\t\t{uid('trelease')} /* Release */,\n\t\t\t);\n\t\t\tdefaultConfigurationIsVisible = 0;\n\t\t\tdefaultConfigurationName = Release;\n\t\t}};")
A(f"\t\t{uid('pconf')} /* Build configuration list for PBXProject \"Buad\" */ = {{\n\t\t\tisa = XCConfigurationList;\n\t\t\tbuildConfigurations = (\n\t\t\t\t{uid('pdebug')} /* Debug */,\n\t\t\t\t{uid('prelease')} /* Release */,\n\t\t\t);\n\t\t\tdefaultConfigurationIsVisible = 0;\n\t\t\tdefaultConfigurationName = Release;\n\t\t}};")
A(f"/* End XCConfigurationList section */\n\t}};\n\trootObject = {uid('project')} /* Project object */;\n}}\n")
os.makedirs(os.path.join(ROOT, "Buad.xcodeproj/xcshareddata/xcschemes"), exist_ok=True)
os.makedirs(os.path.join(ROOT, "Buad.xcodeproj/project.xcworkspace"), exist_ok=True)
open(os.path.join(ROOT, "Buad.xcodeproj/project.pbxproj"), "w").write("\n".join(L))
open(os.path.join(ROOT, "Buad.xcodeproj/project.xcworkspace/contents.xcworkspacedata"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<Workspace\n   version = "1.0">\n   <FileRef\n      location = "self:">\n   </FileRef>\n</Workspace>\n')
ref = f'''<BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "{T}"
               BuildableName = "BuadApp.app"
               BlueprintName = "BuadApp"
               ReferencedContainer = "container:Buad.xcodeproj">
            </BuildableReference>'''
scheme = f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "1430"
   version = "1.7">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
            {ref}
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
      <Testables>
      </Testables>
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         {ref}
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         {ref}
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
'''
open(os.path.join(ROOT, "Buad.xcodeproj/xcshareddata/xcschemes/BuadApp.xcscheme"), "w").write(scheme)
print(len(files), "files")
